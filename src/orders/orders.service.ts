import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { customers } from '../customers/customer.schema.js';
import { shops } from '../shops/shop.schema.js';
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

export function toOrderResponse(row: OrderRow): OrderResponseDto {
  return {
    id: row.id,
    trackingCode: row.trackingCode,
    shopId: row.shopId,
    customerId: row.customerId,
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
      conditions.push(ilike(orders.trackingCode, search));
    }
    if (query.status) conditions.push(eq(orders.status, query.status));
    if (query.shopId) conditions.push(eq(orders.shopId, query.shopId));
    if (query.customerId) {
      conditions.push(eq(orders.customerId, query.customerId));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map(toOrderResponse),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getById(id: string): Promise<OrderDetailResponseDto> {
    const row = await this.orderOrThrow(id);
    const history = await this.historyForOrder(id);
    return { ...toOrderResponse(row), history };
  }

  async getHistory(id: string): Promise<OrderHistoryResponseDto[]> {
    await this.orderOrThrow(id);
    return this.historyForOrder(id);
  }

  async create(
    dto: CreateOrderDto,
    changedBy: string,
  ): Promise<OrderResponseDto> {
    await this.assertShopExists(dto.shopId);
    await this.assertCustomerExists(dto.customerId);

    for (let attempt = 1; attempt <= MAX_TRACKING_CODE_ATTEMPTS; attempt++) {
      try {
        const order = await this.database.db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(orders)
            .values({
              trackingCode: generateTrackingCode(),
              shopId: dto.shopId,
              customerId: dto.customerId,
              packageInfo: dto.packageInfo ?? null,
              deliveryFee: dto.deliveryFee ?? '0',
              codAmount: dto.codAmount ?? '0',
              status: 'PENDING',
              notes: dto.notes ?? null,
            })
            .returning();

          await tx.insert(orderStatusHistory).values({
            orderId: inserted.id,
            fromStatus: null,
            toStatus: 'PENDING',
            changedBy,
            note: 'Order registered',
          });

          return inserted;
        });
        return toOrderResponse(order);
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

  private async orderOrThrow(id: string): Promise<OrderRow> {
    const [row] = await this.database.db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    if (!row) throw new NotFoundException(`Order '${id}' not found`);
    return row;
  }

  private async assertShopExists(shopId: string): Promise<void> {
    const shop = await this.database.db.query.shops.findFirst({
      where: eq(shops.id, shopId),
      columns: { id: true },
    });
    if (!shop) throw new BadRequestException(`Shop '${shopId}' not found`);
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await this.database.db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      columns: { id: true },
    });
    if (!customer) {
      throw new BadRequestException(`Customer '${customerId}' not found`);
    }
  }
}
