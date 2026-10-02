import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { customers } from '../customers/customer.schema.js';
import { deliveryAttemptHistory, deliveryAttempts } from '../deliveries/delivery.schema.js';
import { roles } from '../roles/roles.schema.js';
import { riders } from '../riders/rider.schema.js';
import { shops } from '../shops/shop.schema.js';
import { users } from '../users/user.schema.js';
import { riderTownships, townships, townshipRotation } from '../townships/township.schema.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import { OrderDetailResponseDto } from './dto/order-detail-response.dto.js';
import { OrderHistoryResponseDto } from './dto/order-history-response.dto.js';
import { OrderListResponseDto } from './dto/order-list-response.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { orderStatusHistory } from './order-status-history.schema.js';
import { orders } from './order.schema.js';
import { generateTrackingCode } from './tracking-code.util.js';

const MAX_TRACKING_CODE_ATTEMPTS = 3;

type OrderRow = typeof orders.$inferSelect;
type OrderHistoryRow = typeof orderStatusHistory.$inferSelect;
type OrderTransaction = Pick<
  typeof DatabaseService.prototype.db,
  'select' | 'insert' | 'update'
>;

interface RiderAssignment {
  riderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  townshipName: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  shopName: string;
}

type OrderResponseContext = Omit<
  RiderAssignment,
  'riderId' | 'riderName' | 'riderPhone'
>;
type RiderDetails = Pick<RiderAssignment, 'riderId' | 'riderName' | 'riderPhone'>;

export function toOrderResponse(
  row: OrderRow,
  assignment: RiderAssignment | null = null,
): OrderResponseDto {
  return {
    id: row.id,
    trackingCode: row.trackingCode,
    shopId: row.shopId,
    shopName: assignment?.shopName ?? '',
    customerId: row.customerId,
    customerName: assignment?.customerName ?? '',
    customerPhone: assignment?.customerPhone ?? null,
    customerAddress: assignment?.customerAddress ?? null,
    townshipId: row.townshipId,
    townshipName: assignment?.townshipName ?? '',
    riderId: assignment?.riderId ?? null,
    riderName: assignment?.riderName ?? null,
    riderPhone: assignment?.riderPhone ?? null,
    packageInfo: row.packageInfo as Record<string, unknown> | null,
    deliveryFee: row.deliveryFee,
    codAmount: row.codAmount,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toOrderHistoryResponse(
  row: OrderHistoryRow,
): OrderHistoryResponseDto {
  return {
    id: row.id,
    orderId: row.orderId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedBy: row.changedBy,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListOrdersQueryDto): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const conditions = [];

    if (query.search?.trim()) {
      const search = `%${escapeLikeWildcards(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(orders.trackingCode, search),
          ilike(customers.name, search),
          ilike(customers.phone, search),
        ),
      );
    }
    if (query.status) conditions.push(eq(orders.status, query.status));
    if (query.shopId) conditions.push(eq(orders.shopId, query.shopId));
    if (query.customerId) {
      conditions.push(eq(orders.customerId, query.customerId));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [joinedRows, countResult] = await Promise.all([
      this.database.db
        .select()
        .from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(where),
    ]);

    const rows = joinedRows.map((row) => row.orders);
    const total = Number(countResult[0]?.count ?? 0);
    const data = await this.responsesForOrders(rows);
    return {
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getById(id: string): Promise<OrderDetailResponseDto> {
    const row = await this.orderOrThrow(id);
    const history = await this.historyForOrder(id);
    return { ...(await this.responsesForOrders([row]))[0], history };
  }

  async getHistory(id: string): Promise<OrderHistoryResponseDto[]> {
    await this.orderOrThrow(id);
    return this.historyForOrder(id);
  }

  async create(
    dto: CreateOrderDto,
    changedBy: string,
  ): Promise<OrderResponseDto> {
    const [shop, customer] = await Promise.all([
      this.assertShopExists(dto.shopId),
      this.assertCustomerExists(dto.customerId),
    ]);

    for (let attempt = 1; attempt <= MAX_TRACKING_CODE_ATTEMPTS; attempt++) {
      try {
        const created = await this.database.db.transaction(async (tx) => {
          const { rider, townshipName } = await this.nextRider(tx, dto.townshipId);
          const [inserted] = await tx
            .insert(orders)
            .values({
              trackingCode: generateTrackingCode(),
              shopId: dto.shopId,
              customerId: dto.customerId,
              townshipId: dto.townshipId,
              packageInfo: dto.packageInfo ?? null,
              deliveryFee: dto.deliveryFee ?? '0',
              codAmount: dto.codAmount ?? '0',
              status: 'ASSIGNED',
              notes: dto.notes ?? null,
            })
            .returning();

          await tx.insert(orderStatusHistory).values({
            orderId: inserted.id,
            fromStatus: null,
            toStatus: 'ASSIGNED',
            changedBy,
            note: 'Order registered and assigned by township round-robin',
          });

          const [deliveryAttempt] = await tx
            .insert(deliveryAttempts)
            .values({
              orderId: inserted.id,
              riderId: rider.id,
              attemptNumber: 1,
              assignedBy: changedBy,
            })
            .returning({ id: deliveryAttempts.id });
          await tx.insert(deliveryAttemptHistory).values({
            deliveryAttemptId: deliveryAttempt.id,
            event: 'ASSIGNED',
            actorId: changedBy,
            previousRiderId: null,
            newRiderId: rider.id,
            note: 'Order assigned by township round-robin',
          });
          await tx
            .update(townshipRotation)
            .set({ lastAssignedRiderId: rider.id, updatedAt: new Date() })
            .where(eq(townshipRotation.townshipId, dto.townshipId));

          return { order: inserted, rider, townshipName };
        });
        return toOrderResponse(created.order, {
          riderId: created.rider.id,
          riderName: created.rider.name,
          riderPhone: created.rider.phone,
          townshipName: created.townshipName,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          shopName: shop.name,
        });
      } catch (err) {
        const trackingCollision = isUniqueViolation(err);
        if (trackingCollision && attempt < MAX_TRACKING_CODE_ATTEMPTS) {
          continue;
        }
        if (trackingCollision) {
          throw new ConflictException(
            'Could not allocate a unique tracking code; retry the request',
          );
        }
        throw err;
      }
    }

    throw new ConflictException(
      'Could not allocate a unique tracking code; retry the request',
    );
  }

  private async historyForOrder(
    orderId: string,
  ): Promise<OrderHistoryResponseDto[]> {
    const rows = await this.database.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(orderStatusHistory.createdAt);
    return rows.map(toOrderHistoryResponse);
  }

  private async nextRider(
    tx: OrderTransaction,
    townshipId: string,
  ): Promise<{
    rider: { id: string; name: string; phone: string | null };
    townshipName: string;
  }> {
    const [township] = await tx
      .select({ id: townships.id, name: townships.name })
      .from(townships)
      .where(eq(townships.id, townshipId));
    if (!township) {
      throw new BadRequestException(`Township '${townshipId}' not found`);
    }

    await tx
      .insert(townshipRotation)
      .values({ townshipId })
      .onConflictDoNothing();
    const [rotation] = await tx
      .select({ lastAssignedRiderId: townshipRotation.lastAssignedRiderId })
      .from(townshipRotation)
      .where(eq(townshipRotation.townshipId, townshipId))
      .for('update');
    if (!rotation) throw new ConflictException('Township rotation could not be locked');

    const eligible = await tx
      .select({
        id: riders.id,
        name: users.name,
        phone: users.phone,
      })
      .from(riderTownships)
      .innerJoin(riders, eq(riders.id, riderTownships.riderId))
      .innerJoin(users, eq(users.id, riders.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(riderTownships.townshipId, townshipId),
          eq(users.status, 'ACTIVE'),
          eq(roles.name, 'RIDER'),
        ),
      )
      .orderBy(asc(riders.createdAt), asc(riders.id));

    if (eligible.length === 0) {
      throw new BadRequestException(
        `Township '${township.name}' has no active rider; assign a rider before creating orders`,
      );
    }

    const previousIndex = eligible.findIndex(
      (rider) => rider.id === rotation.lastAssignedRiderId,
    );
    const nextIndex = (previousIndex + 1) % eligible.length;
    return { rider: eligible[nextIndex], townshipName: township.name };
  }

  private async responsesForOrders(rows: OrderRow[]): Promise<OrderResponseDto[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((row) => row.id);
    const townshipIds = [...new Set(rows.map((row) => row.townshipId))];
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const shopIds = [...new Set(rows.map((row) => row.shopId))];
    const [assignmentRows, townshipRows, customerRows, shopRows] = await Promise.all([
      this.database.db
        .select({
          orderId: deliveryAttempts.orderId,
          riderId: riders.id,
          riderName: users.name,
          riderPhone: users.phone,
        })
        .from(deliveryAttempts)
        .innerJoin(riders, eq(riders.id, deliveryAttempts.riderId))
        .innerJoin(users, eq(users.id, riders.userId))
        .where(inArray(deliveryAttempts.orderId, orderIds))
        .orderBy(desc(deliveryAttempts.attemptNumber)),
      this.database.db
        .select({ id: townships.id, name: townships.name })
        .from(townships)
        .where(inArray(townships.id, townshipIds)),
      this.database.db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          address: customers.address,
        })
        .from(customers)
        .where(inArray(customers.id, customerIds)),
      this.database.db
        .select({ id: shops.id, name: shops.name })
        .from(shops)
        .where(inArray(shops.id, shopIds)),
    ]);
    const assignments = new Map<string, RiderDetails>();
    for (const assignment of assignmentRows) {
      if (!assignments.has(assignment.orderId)) {
        assignments.set(assignment.orderId, {
          riderId: assignment.riderId,
          riderName: assignment.riderName,
          riderPhone: assignment.riderPhone,
        });
      }
    }
    const names = new Map(townshipRows.map((township) => [township.id, township.name]));
    const customerDetails = new Map(
      customerRows.map((customer) => [customer.id, customer]),
    );
    const shopNames = new Map(shopRows.map((shop) => [shop.id, shop.name]));
    return rows.map((row) => {
      const assignment = assignments.get(row.id);
      const customer = customerDetails.get(row.customerId);
      return toOrderResponse(
        row,
        {
          ...(assignment ?? {
            riderId: null,
            riderName: null,
            riderPhone: null,
          }),
          ...this.orderResponseContext(row, names, customer, shopNames),
        },
      );
    });
  }

  private orderResponseContext(
    row: OrderRow,
    townshipNames: Map<string, string>,
    customer: { name: string; phone: string | null; address: string | null } | undefined,
    shopNames: Map<string, string>,
  ): OrderResponseContext {
    return {
      townshipName: townshipNames.get(row.townshipId) ?? '',
      customerName: customer?.name ?? '',
      customerPhone: customer?.phone ?? null,
      customerAddress: customer?.address ?? null,
      shopName: shopNames.get(row.shopId) ?? '',
    };
  }

  private async orderOrThrow(id: string): Promise<OrderRow> {
    const [row] = await this.database.db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    if (!row) throw new NotFoundException(`Order '${id}' not found`);
    return row;
  }

  private async assertShopExists(
    shopId: string,
  ): Promise<{ id: string; name: string }> {
    const shop = await this.database.db.query.shops.findFirst({
      where: eq(shops.id, shopId),
      columns: { id: true, name: true },
    });
    if (!shop) throw new BadRequestException(`Shop '${shopId}' not found`);
    return shop;
  }

  private async assertCustomerExists(customerId: string): Promise<{
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  }> {
    const customer = await this.database.db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      columns: { id: true, name: true, phone: true, address: true },
    });
    if (!customer) {
      throw new BadRequestException(`Customer '${customerId}' not found`);
    }
    return customer;
  }
}
