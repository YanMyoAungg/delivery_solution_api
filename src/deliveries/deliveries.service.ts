import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { currentDateInTimezone, localDateRange } from '../common/utils/local-date.util.js';
import { customers } from '../customers/customer.schema.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { orders } from '../orders/order.schema.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { roles } from '../roles/roles.schema.js';
import { riders } from '../riders/rider.schema.js';
import { riderTownships, townships } from '../townships/township.schema.js';
import { shops } from '../shops/shop.schema.js';
import { users } from '../users/user.schema.js';
import { AssignDeliveryDto } from './dto/assign-delivery.dto.js';
import { DeliveryDetailResponseDto } from './dto/delivery-detail-response.dto.js';
import { DeliveryHistoryResponseDto } from './dto/delivery-history-response.dto.js';
import { DeliveryListResponseDto } from './dto/delivery-list-response.dto.js';
import { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import { FailDeliveryDto } from './dto/fail-delivery.dto.js';
import { RiderBoardQueryDto } from './dto/rider-board-query.dto.js';
import { RiderBoardResponseDto } from './dto/rider-board-response.dto.js';
import { RiderDashboardResponseDto } from './dto/rider-dashboard-response.dto.js';
import { RetryDeliveryDto } from './dto/retry-delivery.dto.js';
import {
  deliveryAttemptHistory,
  deliveryAttempts,
  type DeliveryHistoryEvent,
} from './delivery.schema.js';

type DeliveryRow = typeof deliveryAttempts.$inferSelect;
type HistoryRow = typeof deliveryAttemptHistory.$inferSelect;

export const MAX_DELIVERY_ATTEMPTS = 3;

function moneyToCents(value: string): bigint {
  const [whole, fractional = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0').slice(0, 2));
}

function centsToMoney(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function toDeliveryResponse(row: DeliveryRow): DeliveryResponseDto {
  return {
    id: row.id,
    orderId: row.orderId,
    riderId: row.riderId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    failureReason: row.failureReason,
    failureNote: row.failureNote,
    assignedBy: row.assignedBy,
    assignedAt: row.assignedAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHistoryResponse(row: HistoryRow): DeliveryHistoryResponseDto {
  return {
    id: row.id,
    deliveryAttemptId: row.deliveryAttemptId,
    event: row.event,
    actorId: row.actorId,
    previousRiderId: row.previousRiderId,
    newRiderId: row.newRiderId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly orderState: OrderStateService,
    private readonly config: ConfigService,
  ) {}

  async assign(
    orderId: string,
    dto: AssignDeliveryDto,
    actorId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const order = await this.orderOrThrow(orderId);
    if (order.status !== 'ASSIGNED') {
      throw new ConflictException(
        `Order '${orderId}' is not assigned`,
      );
    }
    await this.assertActiveRider(dto.riderId);
    const active = await this.activeAttempt(orderId);
    if (!active)
      throw new ConflictException(
        `Order '${orderId}' has no active delivery attempt`,
      );
    if (active.riderId === dto.riderId) return this.getById(active.id);
    return this.reassign(active.id, dto, actorId);
  }

  async reassign(
    id: string,
    dto: AssignDeliveryDto,
    actorId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const attempt = await this.attemptOrThrow(id);
    if (attempt.status !== 'ASSIGNED')
      throw new ConflictException('Only assigned deliveries can be reassigned');
    await this.assertActiveRider(dto.riderId);
    if (attempt.riderId === dto.riderId) return this.getById(id);
    await this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(deliveryAttempts)
        .set({ riderId: dto.riderId, updatedAt: new Date() })
        .where(
          and(
            eq(deliveryAttempts.id, id),
            eq(deliveryAttempts.status, 'ASSIGNED'),
            eq(deliveryAttempts.riderId, attempt.riderId),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      if (updated.length === 0)
        throw new ConflictException('Delivery assignment changed concurrently');
      await this.addHistory(
        tx,
        id,
        'REASSIGNED',
        actorId,
        attempt.riderId,
        dto.riderId,
      );
    });
    return this.getById(id);
  }

  async getById(id: string): Promise<DeliveryDetailResponseDto> {
    const attempt = await this.attemptOrThrow(id);
    const history = await this.database.db
      .select()
      .from(deliveryAttemptHistory)
      .where(eq(deliveryAttemptHistory.deliveryAttemptId, id))
      .orderBy(asc(deliveryAttemptHistory.createdAt));
    return {
      ...toDeliveryResponse(attempt),
      history: history.map(toHistoryResponse),
    };
  }

  async listForOrder(orderId: string): Promise<DeliveryListResponseDto> {
    await this.orderOrThrow(orderId);
    const rows = await this.database.db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.orderId, orderId))
      .orderBy(desc(deliveryAttempts.attemptNumber));
    return { data: rows.map(toDeliveryResponse) };
  }

  async listForRider(userId: string): Promise<DeliveryListResponseDto> {
    const rider = await this.riderForUserOrThrow(userId);
    const rows = await this.database.db
      .select()
      .from(deliveryAttempts)
      .where(
        and(
          eq(deliveryAttempts.riderId, rider.id),
          eq(deliveryAttempts.status, 'ASSIGNED'),
        ),
      )
      .orderBy(desc(deliveryAttempts.assignedAt));
    return { data: rows.map(toDeliveryResponse) };
  }

  async riderBoard(
    userId: string,
    query: RiderBoardQueryDto,
  ): Promise<RiderBoardResponseDto> {
    const rider = await this.riderForUserOrThrow(userId);
    const timezone = this.config.get<string>('APP_TIMEZONE') ?? 'Asia/Yangon';
    const date = query.date ?? currentDateInTimezone(timezone);
    const filter = query.filter ?? 'all';
    const townshipAssignments = await this.database.db
      .select({ townshipId: riderTownships.townshipId })
      .from(riderTownships)
      .where(eq(riderTownships.riderId, rider.id));
    const townshipIds = townshipAssignments.map((row) => row.townshipId);
    if (townshipIds.length === 0) {
      return {
        date,
        filter,
        data: [],
        meta: {
          page: query.page ?? 1,
          perPage: query.perPage ?? 50,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const orderRows = await this.database.db
      .select({
        id: orders.id,
        trackingCode: orders.trackingCode,
        status: orders.status,
        townshipId: orders.townshipId,
        townshipName: townships.name,
        shopName: shops.name,
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerAddress: customers.address,
        packageInfo: orders.packageInfo,
        deliveryFee: orders.deliveryFee,
        codAmount: orders.codAmount,
        notes: orders.notes,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(townships, eq(townships.id, orders.townshipId))
      .innerJoin(shops, eq(shops.id, orders.shopId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          inArray(orders.townshipId, townshipIds),
          localDateRange(orders.createdAt, date, timezone),
        ),
      )
      .orderBy(desc(orders.createdAt));

    const assignments = await this.latestAssignments(orderRows.map((row) => row.id));
    const filtered = orderRows
      .map((row) => {
        const assignment = assignments.get(row.id);
        return {
          row,
          assignedRiderId: assignment?.riderId ?? null,
          assignment,
        };
      })
      .filter(({ assignedRiderId }) =>
        filter === 'all' || assignedRiderId === rider.id,
      );
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    const total = filtered.length;
    const data = filtered
      .slice((page - 1) * perPage, page * perPage)
      .map(({ row, assignedRiderId, assignment }) => {
        const isMine = assignedRiderId === rider.id;
        return {
          id: row.id,
          trackingCode: row.trackingCode,
          status: row.status,
          townshipId: row.townshipId,
          townshipName: row.townshipName,
          shopName: row.shopName,
          assignedRiderName: assignment?.riderName ?? null,
          isMine,
          createdAt: row.createdAt.toISOString(),
          ...(isMine && {
            deliveryAttemptId: assignment?.deliveryAttemptId,
            attemptNumber: assignment?.attemptNumber,
            customerId: row.customerId,
            customerName: row.customerName,
            customerPhone: row.customerPhone,
            customerAddress: row.customerAddress,
            packageInfo: row.packageInfo as Record<string, unknown> | null,
            deliveryFee: row.deliveryFee,
            codAmount: row.codAmount,
            notes: row.notes,
          }),
        };
      });

    return {
      date,
      filter,
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async riderDashboard(
    userId: string,
    requestedDate?: string,
  ): Promise<RiderDashboardResponseDto> {
    const rider = await this.riderForUserOrThrow(userId);
    const timezone = this.config.get<string>('APP_TIMEZONE') ?? 'Asia/Yangon';
    const date = requestedDate ?? currentDateInTimezone(timezone);
    const attempts = await this.database.db
      .select({
        orderId: deliveryAttempts.orderId,
        attemptNumber: deliveryAttempts.attemptNumber,
        status: deliveryAttempts.status,
        codAmount: orders.codAmount,
      })
      .from(deliveryAttempts)
      .innerJoin(orders, eq(orders.id, deliveryAttempts.orderId))
      .where(
        and(
          eq(deliveryAttempts.riderId, rider.id),
          localDateRange(deliveryAttempts.assignedAt, date, timezone),
        ),
      )
      .orderBy(desc(deliveryAttempts.attemptNumber));

    const latestByOrder = new Map<
      string,
      (typeof attempts)[number]
    >();
    for (const attempt of attempts) {
      if (!latestByOrder.has(attempt.orderId)) {
        latestByOrder.set(attempt.orderId, attempt);
      }
    }
    let assigned = 0;
    let delivered = 0;
    let failed = 0;
    let codCollectedCents = 0n;
    let codOutstandingCents = 0n;
    for (const attempt of latestByOrder.values()) {
      if (attempt.status === 'ASSIGNED') {
        assigned += 1;
        codOutstandingCents += moneyToCents(attempt.codAmount);
      } else if (attempt.status === 'DELIVERED') {
        delivered += 1;
        codCollectedCents += moneyToCents(attempt.codAmount);
      } else {
        failed += 1;
        codOutstandingCents += moneyToCents(attempt.codAmount);
      }
    }
    const completed = delivered + failed;
    return {
      date,
      assigned,
      delivered,
      failed,
      successRate: completed === 0 ? 0 : Number(((delivered / completed) * 100).toFixed(2)),
      codCollected: centsToMoney(codCollectedCents),
      codOutstanding: centsToMoney(codOutstandingCents),
    };
  }

  async complete(
    id: string,
    userId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const attempt = await this.attemptOrThrow(id);
    await this.assertOwnership(attempt, userId);
    if (attempt.status !== 'ASSIGNED')
      throw new ConflictException('Delivery is not assigned');
    await this.database.db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(deliveryAttempts)
        .set({ status: 'DELIVERED', deliveredAt: now, updatedAt: now })
        .where(
          and(
            eq(deliveryAttempts.id, id),
            eq(deliveryAttempts.status, 'ASSIGNED'),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      if (updated.length === 0)
        throw new ConflictException('Delivery changed concurrently');
      await this.orderState.applyTransitionInTransaction(tx, {
        orderId: attempt.orderId,
        fromStatus: 'ASSIGNED',
        toStatus: 'DELIVERED',
        changedBy: userId,
        note: `Delivery attempt ${attempt.attemptNumber} completed`,
      });
      await this.addHistory(tx, id, 'DELIVERED', userId, null, attempt.riderId);
    });
    return this.getById(id);
  }

  async fail(
    id: string,
    dto: FailDeliveryDto,
    userId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const attempt = await this.attemptOrThrow(id);
    await this.assertOwnership(attempt, userId);
    if (attempt.status !== 'ASSIGNED')
      throw new ConflictException('Delivery is not assigned');
    await this.database.db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(deliveryAttempts)
        .set({
          status: 'FAILED',
          failureReason: dto.reason,
          failureNote: dto.note ?? null,
          failedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveryAttempts.id, id),
            eq(deliveryAttempts.status, 'ASSIGNED'),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      if (updated.length === 0)
        throw new ConflictException('Delivery changed concurrently');
      await this.orderState.applyTransitionInTransaction(tx, {
        orderId: attempt.orderId,
        fromStatus: 'ASSIGNED',
        toStatus: 'FAILED',
        changedBy: userId,
        note: `Delivery attempt ${attempt.attemptNumber} failed: ${dto.reason}`,
      });
      await this.addHistory(
        tx,
        id,
        'FAILED',
        userId,
        null,
        attempt.riderId,
        dto.note,
      );
    });
    return this.getById(id);
  }

  async retry(
    orderId: string,
    dto: RetryDeliveryDto,
    actorId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const order = await this.orderOrThrow(orderId);
    if (order.status !== 'FAILED')
      throw new ConflictException(`Order '${orderId}' is not failed`);
    await this.assertActiveRider(dto.riderId);
    const active = await this.activeAttempt(orderId);
    if (active)
      throw new ConflictException(
        `Order '${orderId}' already has an active delivery attempt`,
      );
    let created: DeliveryRow;
    try {
      created = await this.database.db.transaction(async (tx) => {
        const attempts = await tx
          .select({ attemptNumber: deliveryAttempts.attemptNumber })
          .from(deliveryAttempts)
          .where(eq(deliveryAttempts.orderId, orderId))
          .orderBy(desc(deliveryAttempts.attemptNumber));
        const attemptNumber = (attempts[0]?.attemptNumber ?? 0) + 1;
        if (attemptNumber > MAX_DELIVERY_ATTEMPTS)
          throw new ConflictException('Maximum delivery attempts reached');
        const [attempt] = await tx
          .insert(deliveryAttempts)
          .values({
            orderId,
            riderId: dto.riderId,
            attemptNumber,
            assignedBy: actorId,
          })
          .returning();
        await this.orderState.applyTransitionInTransaction(tx, {
          orderId,
          fromStatus: 'FAILED',
          toStatus: 'ASSIGNED',
          changedBy: actorId,
          note: `Delivery attempt ${attemptNumber} created as retry`,
        });
        await this.addHistory(
          tx,
          attempt.id,
          'RETRY_CREATED',
          actorId,
          null,
          dto.riderId,
        );
        return attempt;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Order '${orderId}' already has an active delivery attempt`,
        );
      }
      throw err;
    }
    return this.getById(created.id);
  }

  private async addHistory(
    tx: Pick<typeof DatabaseService.prototype.db, 'insert'>,
    deliveryAttemptId: string,
    event: DeliveryHistoryEvent,
    actorId: string,
    previousRiderId: string | null,
    newRiderId: string | null,
    note?: string | null,
  ): Promise<void> {
    await tx.insert(deliveryAttemptHistory).values({
      deliveryAttemptId,
      event,
      actorId,
      previousRiderId,
      newRiderId,
      note: note ?? null,
    });
  }

  private async assertOwnership(
    attempt: DeliveryRow,
    userId: string,
  ): Promise<void> {
    const rider = await this.riderForUserOrThrow(userId);
    if (attempt.riderId !== rider.id)
      throw new ForbiddenException('Delivery is not assigned to you');
  }

  private async assertActiveRider(riderId: string): Promise<void> {
    const [row] = await this.database.db
      .select({ riderId: riders.id })
      .from(riders)
      .innerJoin(users, eq(riders.userId, users.id))
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(
        and(
          eq(riders.id, riderId),
          eq(roles.name, 'RIDER'),
          eq(users.status, 'ACTIVE'),
        ),
      );
    if (!row)
      throw new BadRequestException(`Active rider '${riderId}' not found`);
  }

  private async riderForUserOrThrow(
    userId: string,
  ): Promise<typeof riders.$inferSelect> {
    const row = await this.database.db.query.riders.findFirst({
      where: eq(riders.userId, userId),
    });
    if (!row) throw new ForbiddenException('Authenticated user is not a rider');
    return row;
  }

  private async activeAttempt(
    orderId: string,
  ): Promise<DeliveryRow | undefined> {
    return this.database.db.query.deliveryAttempts.findFirst({
      where: and(
        eq(deliveryAttempts.orderId, orderId),
        eq(deliveryAttempts.status, 'ASSIGNED'),
      ),
    });
  }

  private async latestAssignments(
    orderIds: string[],
  ): Promise<
    Map<
      string,
      {
        deliveryAttemptId: string;
        attemptNumber: number;
        riderId: string;
        riderName: string;
      }
    >
  > {
    if (orderIds.length === 0) return new Map();
    const rows = await this.database.db
      .select({
        orderId: deliveryAttempts.orderId,
        deliveryAttemptId: deliveryAttempts.id,
        attemptNumber: deliveryAttempts.attemptNumber,
        riderId: riders.id,
        riderName: users.name,
      })
      .from(deliveryAttempts)
      .innerJoin(riders, eq(riders.id, deliveryAttempts.riderId))
      .innerJoin(users, eq(users.id, riders.userId))
      .where(inArray(deliveryAttempts.orderId, orderIds))
      .orderBy(desc(deliveryAttempts.attemptNumber));
    const assignments = new Map<
      string,
      {
        deliveryAttemptId: string;
        attemptNumber: number;
        riderId: string;
        riderName: string;
      }
    >();
    for (const row of rows) {
      if (!assignments.has(row.orderId)) {
        assignments.set(row.orderId, {
          deliveryAttemptId: row.deliveryAttemptId,
          attemptNumber: row.attemptNumber,
          riderId: row.riderId,
          riderName: row.riderName,
        });
      }
    }
    return assignments;
  }

  private async attemptOrThrow(id: string): Promise<DeliveryRow> {
    const row = await this.database.db.query.deliveryAttempts.findFirst({
      where: eq(deliveryAttempts.id, id),
    });
    if (!row) throw new NotFoundException(`Delivery attempt '${id}' not found`);
    return row;
  }

  private async orderOrThrow(id: string): Promise<typeof orders.$inferSelect> {
    const [row] = await this.database.db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    if (!row) throw new NotFoundException(`Order '${id}' not found`);
    return row;
  }
}
