import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { orders } from '../orders/order.schema.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { roles } from '../roles/roles.schema.js';
import { riders } from '../riders/rider.schema.js';
import { users } from '../users/user.schema.js';
import { AssignDeliveryDto } from './dto/assign-delivery.dto.js';
import { DeliveryDetailResponseDto } from './dto/delivery-detail-response.dto.js';
import { DeliveryHistoryResponseDto } from './dto/delivery-history-response.dto.js';
import { DeliveryListResponseDto } from './dto/delivery-list-response.dto.js';
import { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import { FailDeliveryDto } from './dto/fail-delivery.dto.js';
import { RetryDeliveryDto } from './dto/retry-delivery.dto.js';
import {
  deliveryAttemptHistory,
  deliveryAttempts,
  type DeliveryHistoryEvent,
} from './delivery.schema.js';

type DeliveryRow = typeof deliveryAttempts.$inferSelect;
type HistoryRow = typeof deliveryAttemptHistory.$inferSelect;

export const MAX_DELIVERY_ATTEMPTS = 3;

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
    startedAt: row.startedAt?.toISOString() ?? null,
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
  ) {}

  async assign(
    orderId: string,
    dto: AssignDeliveryDto,
    actorId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const order = await this.orderOrThrow(orderId);
    if (order.status !== 'RECEIVED_AT_OFFICE') {
      throw new ConflictException(
        `Order '${orderId}' is not received at the office`,
      );
    }
    await this.assertActiveRider(dto.riderId);
    const active = await this.activeAttempt(orderId);
    if (active) {
      if (active.riderId === dto.riderId) return this.getById(active.id);
      throw new ConflictException(
        `Order '${orderId}' already has an active delivery attempt`,
      );
    }

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
          fromStatus: 'RECEIVED_AT_OFFICE',
          toStatus: 'ASSIGNED',
          changedBy: actorId,
          note: `Delivery attempt ${attemptNumber} assigned`,
        });
        await this.addHistory(
          tx,
          attempt.id,
          'ASSIGNED',
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
          inArray(deliveryAttempts.status, ['ASSIGNED', 'OUT_FOR_DELIVERY']),
        ),
      )
      .orderBy(desc(deliveryAttempts.assignedAt));
    return { data: rows.map(toDeliveryResponse) };
  }

  async start(id: string, userId: string): Promise<DeliveryDetailResponseDto> {
    const attempt = await this.attemptOrThrow(id);
    await this.assertOwnership(attempt, userId);
    if (attempt.status !== 'ASSIGNED')
      throw new ConflictException('Delivery is not assigned');
    await this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(deliveryAttempts)
        .set({
          status: 'OUT_FOR_DELIVERY',
          startedAt: new Date(),
          updatedAt: new Date(),
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
        toStatus: 'OUT_FOR_DELIVERY',
        changedBy: userId,
        note: `Delivery attempt ${attempt.attemptNumber} started`,
      });
      await this.addHistory(tx, id, 'STARTED', userId, null, attempt.riderId);
    });
    return this.getById(id);
  }

  async complete(
    id: string,
    userId: string,
  ): Promise<DeliveryDetailResponseDto> {
    const attempt = await this.attemptOrThrow(id);
    await this.assertOwnership(attempt, userId);
    if (attempt.status !== 'OUT_FOR_DELIVERY')
      throw new ConflictException('Delivery is not out for delivery');
    await this.database.db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(deliveryAttempts)
        .set({ status: 'DELIVERED', deliveredAt: now, updatedAt: now })
        .where(
          and(
            eq(deliveryAttempts.id, id),
            eq(deliveryAttempts.status, 'OUT_FOR_DELIVERY'),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      if (updated.length === 0)
        throw new ConflictException('Delivery changed concurrently');
      await this.orderState.applyTransitionInTransaction(tx, {
        orderId: attempt.orderId,
        fromStatus: 'OUT_FOR_DELIVERY',
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
    if (attempt.status !== 'OUT_FOR_DELIVERY')
      throw new ConflictException('Delivery is not out for delivery');
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
            eq(deliveryAttempts.status, 'OUT_FOR_DELIVERY'),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      if (updated.length === 0)
        throw new ConflictException('Delivery changed concurrently');
      await this.orderState.applyTransitionInTransaction(tx, {
        orderId: attempt.orderId,
        fromStatus: 'OUT_FOR_DELIVERY',
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
        inArray(deliveryAttempts.status, ['ASSIGNED', 'OUT_FOR_DELIVERY']),
      ),
    });
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
