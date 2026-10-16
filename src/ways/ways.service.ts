import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lte,
  not,
  notExists,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { getDateInTimeZone } from '../common/utils/timezone-date.util.js';
import { orders } from '../orders/order.schema.js';
import { orderStatusHistory } from '../orders/order-status-history.schema.js';
import { riders } from '../riders/rider.schema.js';
import { users } from '../users/user.schema.js';
import { appSettings } from '../common/database/app-settings.schema.js';
import { ways } from './way.schema.js';
import { ListWaysQueryDto } from './dto/list-ways-query.dto.js';
import { CreateWayDto } from './dto/create-way.dto.js';
import { MoveWayOrdersDto } from './dto/move-way-orders.dto.js';
import { PayWayAnywayDto } from './dto/pay-way-anyway.dto.js';
import { UpdateCommissionRateDto } from './dto/update-commission-rate.dto.js';
import { CommissionRateResponseDto } from './dto/commission-rate-response.dto.js';
import { WayDetailResponseDto } from './dto/way-detail-response.dto.js';
import { WayOrderResponseDto } from './dto/way-order-response.dto.js';
import { WayResponseDto } from './dto/way-response.dto.js';
import { deriveWayFinancialState } from './way-state.util.js';
import { assertCanPayWayAnyway, assertOrdersCanMoveBetweenWays } from './way-rules.util.js';
import { getWaySequence } from './way-sequence.util.js';

type WayTransaction = Pick<typeof DatabaseService.prototype.db, 'select' | 'insert' | 'update'>;
type WayRow = typeof ways.$inferSelect;
type WayOrderRow = typeof orders.$inferSelect;

function toWayOrderResponse(row: WayOrderRow): WayOrderResponseDto {
  return {
    id: row.id,
    trackingCode: row.trackingCode,
    status: row.status,
    wayId: row.wayId,
    riderId: row.riderId,
    partnerId: row.partnerId,
    packagePrice: row.packagePrice,
    deliveryFee: row.deliveryFee,
    partnerFee: row.partnerFee,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class WaysService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  getToday(date = new Date()): string {
    return getDateInTimeZone(date, this.config.get<string>('APP_TIMEZONE') ?? 'Asia/Yangon');
  }

  async findOrCreateOpenWayForRider(
    transaction: WayTransaction,
    riderId: string,
    wayDate = this.getToday(),
  ): Promise<string> {
    const [rider] = await transaction.select({
      id: riders.id,
      commissionPerWayOverride: riders.commissionPerWayOverride,
    }).from(riders).where(eq(riders.id, riderId)).for('update');
    if (!rider) throw new NotFoundException(`Rider '${riderId}' not found`);

    const [setting] = await transaction.select({ value: appSettings.value })
      .from(appSettings).where(eq(appSettings.key, 'commissionPerWay'));
    const commissionRate = rider.commissionPerWayOverride ?? setting?.value ?? '500.00';

    const [created] = await transaction.insert(ways).values({
      riderId,
      wayDate,
      commissionRate,
    }).onConflictDoNothing().returning({ id: ways.id });
    if (created) return created.id;

    const [existing] = await transaction.select({ id: ways.id }).from(ways).where(and(
      eq(ways.riderId, riderId),
      eq(ways.wayDate, wayDate),
      eq(ways.isOpen, true),
    ));
    if (!existing) throw new ConflictException('Could not find or create an open way for this rider');
    return existing.id;
  }

  async list(query: ListWaysQueryDto): Promise<WayResponseDto[]> {
    const conditions: SQL[] = [];
    if (query.riderId) conditions.push(eq(ways.riderId, query.riderId));
    if (query.dateFrom) conditions.push(gte(ways.wayDate, query.dateFrom));
    if (query.dateTo) conditions.push(lte(ways.wayDate, query.dateTo));
    if (query.state) conditions.push(this.stateCondition(query.state));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await this.database.db.select({
      way: ways,
      riderName: users.name,
    }).from(ways)
      .innerJoin(riders, eq(ways.riderId, riders.id))
      .innerJoin(users, eq(riders.userId, users.id))
      .where(where)
      .orderBy(desc(ways.wayDate), desc(ways.createdAt));
    const wayIds = rows.map(({ way }) => way.id);
    const orderCounts = wayIds.length
      ? await this.database.db.select({ wayId: orders.wayId, orderCount: count() })
        .from(orders).where(inArray(orders.wayId, wayIds)).groupBy(orders.wayId)
      : [];
    const deliveredCounts = wayIds.length
      ? await this.database.db.select({ wayId: orders.wayId, orderCount: count() })
        .from(orders).where(and(inArray(orders.wayId, wayIds), eq(orders.status, 'DELIVERED')))
        .groupBy(orders.wayId)
      : [];
    const orderCountByWay = new Map(orderCounts.map((row) => [row.wayId, Number(row.orderCount)]));
    const deliveredCountByWay = new Map(deliveredCounts.map((row) => [row.wayId, Number(row.orderCount)]));
    const sequenceByWay = new Map<string, number>();
    for (const { way } of rows) {
      sequenceByWay.set(way.id, await this.sequenceForWay(way));
    }
    return rows.map(({ way, riderName }) => this.toWayResponse(
      way,
      riderName,
      sequenceByWay.get(way.id) ?? 1,
      orderCountByWay.get(way.id) ?? 0,
      deliveredCountByWay.get(way.id) ?? 0,
    ));
  }

  async getById(id: string): Promise<WayDetailResponseDto> {
    const wayResponse = await this.wayResponseOrThrow(id);
    const orderRows = await this.database.db.select().from(orders)
      .where(eq(orders.wayId, id)).orderBy(asc(orders.createdAt));
    return { ...wayResponse, orders: orderRows.map(toWayOrderResponse) };
  }

  async create(input: CreateWayDto): Promise<WayResponseDto> {
    const wayId = await this.database.db.transaction(async (transaction) => {
      const [rider] = await transaction.select({ id: riders.id }).from(riders)
        .where(eq(riders.id, input.riderId)).for('update');
      if (!rider) throw new NotFoundException(`Rider '${input.riderId}' not found`);
      const today = this.getToday();
      await transaction.update(ways).set({ isOpen: false, updatedAt: new Date() })
        .where(and(eq(ways.riderId, input.riderId), eq(ways.wayDate, today), eq(ways.isOpen, true)));
      return this.findOrCreateOpenWayForRider(transaction, input.riderId, today);
    });
    return this.wayResponseOrThrow(wayId);
  }

  async close(id: string): Promise<WayResponseDto> {
    await this.database.db.transaction(async (transaction) => {
      const way = await this.lockWayOrThrow(transaction, id);
      if (!way.isOpen) throw new ConflictException('Way is already closed');
      await transaction.update(ways).set({ isOpen: false, updatedAt: new Date() })
        .where(eq(ways.id, id));
    });
    return this.wayResponseOrThrow(id);
  }

  async moveOrders(sourceWayId: string, input: MoveWayOrdersDto, actorId: string): Promise<WayDetailResponseDto> {
    await this.database.db.transaction(async (transaction) => {
      const source = await this.lockWayOrThrow(transaction, sourceWayId);
      const target = await this.lockWayOrThrow(transaction, input.targetWayId);
      const orderRows = await transaction.select().from(orders)
        .where(inArray(orders.id, input.orderIds)).for('update');
      if (orderRows.length !== input.orderIds.length) {
        throw new NotFoundException('One or more orders were not found');
      }
      assertOrdersCanMoveBetweenWays(
        sourceWayId,
        source.riderId,
        input.targetWayId,
        target.riderId,
        orderRows,
      );
      const sourceWayIds = [...new Set(orderRows.map((order) => order.wayId).filter((id): id is string => id !== null))];
      if (sourceWayIds.length !== new Set(orderRows.map((order) => order.wayId)).size) {
        throw new BadRequestException('Every order must currently belong to a way');
      }
      const sourceWays = sourceWayIds.length
        ? await transaction.select({ id: ways.id, riderId: ways.riderId }).from(ways)
          .where(inArray(ways.id, sourceWayIds))
        : [];
      if (sourceWays.length !== sourceWayIds.length || sourceWays.some((way) => way.riderId !== target.riderId)) {
        throw new BadRequestException('Orders can only move between ways belonging to the same rider');
      }
      for (const order of orderRows) {
        await transaction.update(orders).set({ wayId: input.targetWayId, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        await transaction.insert(orderStatusHistory).values({
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            changedBy: actorId,
            note: `Order moved from way '${sourceWayId}' to way '${input.targetWayId}'`,
          });
      }
    });
    return this.getById(input.targetWayId);
  }

  async payAnyway(id: string, input: PayWayAnywayDto, actorId: string): Promise<WayResponseDto> {
    await this.database.db.transaction(async (transaction) => {
      const way = await this.lockWayOrThrow(transaction, id);
      const [deliveredOrder] = await transaction.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.wayId, id), eq(orders.status, 'DELIVERED'))).limit(1);
      assertCanPayWayAnyway(way.isPaidWithoutDelivery, deliveredOrder ? 1 : 0);
      await transaction.update(ways).set({
        isPaidWithoutDelivery: true,
        payAnywayReason: input.reason.trim(),
        payAnywayBy: actorId,
        payAnywayAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(ways.id, id));
    });
    return this.wayResponseOrThrow(id);
  }

  async getCommissionRate(): Promise<CommissionRateResponseDto> {
    const [setting] = await this.database.db.select({ value: appSettings.value })
      .from(appSettings).where(eq(appSettings.key, 'commissionPerWay'));
    return { key: 'commissionPerWay', value: setting?.value ?? '500.00' };
  }

  async updateCommissionRate(input: UpdateCommissionRateDto): Promise<CommissionRateResponseDto> {
    await this.database.db.insert(appSettings).values({ key: 'commissionPerWay', value: input.value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: input.value, updatedAt: new Date() } });
    return this.getCommissionRate();
  }

  private stateCondition(state: string): SQL {
    const hasOrders = exists(this.database.db.select({ id: orders.id }).from(orders)
      .where(eq(orders.wayId, ways.id)));
    const hasDeliveredOrders = exists(this.database.db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.wayId, ways.id), eq(orders.status, 'DELIVERED'))));
    if (state === 'EMPTY') return and(
      eq(ways.isPaidWithoutDelivery, false),
      notExists(this.database.db.select({ id: orders.id }).from(orders)
        .where(eq(orders.wayId, ways.id))),
    ) as SQL;
    if (state === 'PENDING_APPROVAL') return and(
      eq(ways.isPaidWithoutDelivery, false), hasOrders, not(hasDeliveredOrders),
    ) as SQL;
    if (state === 'EARNED') return and(eq(ways.isPaidWithoutDelivery, false), hasDeliveredOrders) as SQL;
    return eq(ways.isPaidWithoutDelivery, true);
  }

  private async wayResponseOrThrow(id: string): Promise<WayResponseDto> {
    const [row] = await this.database.db.select({ way: ways, riderName: users.name })
      .from(ways).innerJoin(riders, eq(ways.riderId, riders.id))
      .innerJoin(users, eq(riders.userId, users.id)).where(eq(ways.id, id));
    if (!row) throw new NotFoundException(`Way '${id}' not found`);
    const [counts] = await this.database.db.select({
      orderCount: count(),
      deliveredCount: sql<number>`count(*) filter (where ${orders.status} = 'DELIVERED')`,
    }).from(orders).where(eq(orders.wayId, id));
    const sequence = await this.sequenceForWay(row.way);
    return this.toWayResponse(row.way, row.riderName, sequence, Number(counts?.orderCount ?? 0), Number(counts?.deliveredCount ?? 0));
  }

  private async sequenceForWay(way: WayRow): Promise<number> {
    const sameDayWays = await this.database.db.select({ id: ways.id, createdAt: ways.createdAt }).from(ways).where(and(
      eq(ways.riderId, way.riderId),
      eq(ways.wayDate, way.wayDate),
    )).orderBy(asc(ways.createdAt), asc(ways.id));
    return getWaySequence(sameDayWays, way.id);
  }

  private toWayResponse(
    way: WayRow,
    riderName: string,
    sequence: number,
    orderCount: number,
    deliveredOrderCount: number,
  ): WayResponseDto {
    const financialState = deriveWayFinancialState(
      orderCount,
      deliveredOrderCount,
      way.isPaidWithoutDelivery,
      way.commissionRate,
    );
    return {
      id: way.id,
      riderId: way.riderId,
      riderName,
      wayDate: way.wayDate,
      sequence,
      commissionRate: way.commissionRate,
      isOpen: way.isOpen,
      state: financialState.state,
      orderCount,
      commissionAmount: financialState.commissionAmount,
      pendingAmount: financialState.pendingAmount,
      isPaidWithoutDelivery: way.isPaidWithoutDelivery,
      payAnywayReason: way.payAnywayReason,
      payAnywayBy: way.payAnywayBy,
      payAnywayAt: way.payAnywayAt?.toISOString() ?? null,
      createdAt: way.createdAt.toISOString(),
      updatedAt: way.updatedAt.toISOString(),
    };
  }

  private async lockWayOrThrow(transaction: WayTransaction, id: string): Promise<WayRow> {
    const [way] = await transaction.select().from(ways).where(eq(ways.id, id)).for('update');
    if (!way) throw new NotFoundException(`Way '${id}' not found`);
    return way;
  }
}
