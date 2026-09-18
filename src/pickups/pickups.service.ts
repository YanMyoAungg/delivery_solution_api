import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { orders } from '../orders/order.schema.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { CreatePickupDto } from './dto/create-pickup.dto.js';
import { ListPickupsQueryDto } from './dto/list-pickups-query.dto.js';
import { PickupListResponseDto } from './dto/pickup-list-response.dto.js';
import { PickupResponseDto } from './dto/pickup-response.dto.js';
import { pickupOrders, pickups } from './pickup.schema.js';

type PickupRow = typeof pickups.$inferSelect;

function toPickupResponse(
  row: PickupRow,
  orderIds: string[],
): PickupResponseDto {
  return {
    id: row.id,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    notes: row.notes,
    createdBy: row.createdBy,
    orderIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PickupsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly orderState: OrderStateService,
  ) {}

  async create(
    dto: CreatePickupDto,
    createdBy: string,
    idempotencyKey: string,
  ): Promise<PickupResponseDto> {
    const key = idempotencyKey.trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    const existing = await this.database.db.query.pickups.findFirst({
      where: and(
        eq(pickups.createdBy, createdBy),
        eq(pickups.idempotencyKey, key),
      ),
    });
    if (existing) return this.getById(existing.id);

    const orderIds = [...new Set(dto.orderIds)];
    if (orderIds.length !== dto.orderIds.length) {
      throw new BadRequestException('Pickup orderIds must be unique');
    }

    const rows = await this.database.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(inArray(orders.id, orderIds));
    if (rows.length !== orderIds.length) {
      throw new BadRequestException('One or more pickup orders were not found');
    }
    if (rows.some((row) => row.status !== 'PENDING')) {
      throw new ConflictException('All pickup orders must be PENDING');
    }

    const alreadyScheduled = await this.database.db
      .select({ orderId: pickupOrders.orderId })
      .from(pickupOrders)
      .innerJoin(pickups, eq(pickupOrders.pickupId, pickups.id))
      .where(
        and(
          inArray(pickupOrders.orderId, orderIds),
          eq(pickups.status, 'SCHEDULED'),
        ),
      );
    if (alreadyScheduled.length > 0) {
      throw new ConflictException(
        'One or more orders are already in a scheduled pickup',
      );
    }

    try {
      const pickupId = await this.database.db.transaction(async (tx) => {
        const [pickup] = await tx
          .insert(pickups)
          .values({
            scheduledAt: new Date(dto.scheduledAt),
            status: 'SCHEDULED',
            notes: dto.notes ?? null,
            createdBy,
            idempotencyKey: key,
          })
          .returning({ id: pickups.id });
        await tx
          .insert(pickupOrders)
          .values(
            orderIds.map((orderId) => ({
              pickupId: pickup.id,
              orderId,
              active: true,
            })),
          );
        return pickup.id;
      });
      return this.getById(pickupId);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const retry = await this.database.db.query.pickups.findFirst({
          where: and(
            eq(pickups.createdBy, createdBy),
            eq(pickups.idempotencyKey, key),
          ),
        });
        if (retry) return this.getById(retry.id);
      }
      throw err;
    }
  }

  async list(query: ListPickupsQueryDto): Promise<PickupListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const where = query.status ? eq(pickups.status, query.status) : undefined;
    const [rows, countResult] = await Promise.all([
      this.database.db
        .select()
        .from(pickups)
        .where(where)
        .orderBy(desc(pickups.scheduledAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(pickups)
        .where(where),
    ]);
    const data = await Promise.all(rows.map((row) => this.toResponse(row)));
    const total = Number(countResult[0]?.count ?? 0);
    return {
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getById(id: string): Promise<PickupResponseDto> {
    return this.toResponse(await this.pickupOrThrow(id));
  }

  async complete(id: string, actorId: string): Promise<PickupResponseDto> {
    return this.advancePickup(
      id,
      actorId,
      'SCHEDULED',
      'COMPLETED',
      'PENDING',
      'PICKED_UP',
    );
  }

  async receive(id: string, actorId: string): Promise<PickupResponseDto> {
    return this.advancePickup(
      id,
      actorId,
      'COMPLETED',
      'COMPLETED',
      'PICKED_UP',
      'RECEIVED_AT_OFFICE',
    );
  }

  async cancel(id: string): Promise<PickupResponseDto> {
    const pickup = await this.pickupOrThrow(id);
    if (pickup.status !== 'SCHEDULED') {
      throw new ConflictException(`Pickup '${id}' is not scheduled`);
    }
    await this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(pickups)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(and(eq(pickups.id, id), eq(pickups.status, 'SCHEDULED')))
        .returning({ id: pickups.id });
      if (updated.length === 0) {
        throw new ConflictException(`Pickup '${id}' changed concurrently`);
      }
      await tx
        .update(pickupOrders)
        .set({ active: false })
        .where(eq(pickupOrders.pickupId, id));
    });
    return this.getById(id);
  }

  private async advancePickup(
    id: string,
    actorId: string,
    pickupFrom: PickupRow['status'],
    pickupTo: PickupRow['status'],
    orderFrom: 'PENDING' | 'PICKED_UP',
    orderTo: 'PICKED_UP' | 'RECEIVED_AT_OFFICE',
  ): Promise<PickupResponseDto> {
    const pickup = await this.pickupOrThrow(id);
    if (pickup.status !== pickupFrom) {
      throw new ConflictException(
        `Pickup '${id}' is not in status '${pickupFrom}'`,
      );
    }
    const links = await this.database.db
      .select({ orderId: pickupOrders.orderId })
      .from(pickupOrders)
      .where(eq(pickupOrders.pickupId, id))
      .orderBy(asc(pickupOrders.orderId));
    if (links.length === 0)
      throw new ConflictException(`Pickup '${id}' has no orders`);

    await this.database.db.transaction(async (tx) => {
      for (const link of links) {
        await this.orderState.applyTransitionInTransaction(tx, {
          orderId: link.orderId,
          fromStatus: orderFrom,
          toStatus: orderTo,
          changedBy: actorId,
          note:
            orderTo === 'PICKED_UP'
              ? `Pickup '${id}' completed`
              : `Pickup '${id}' received at office`,
        });
      }
      await tx
        .update(pickupOrders)
        .set({ active: false })
        .where(eq(pickupOrders.pickupId, id));
      const updated = await tx
        .update(pickups)
        .set({ status: pickupTo, updatedAt: new Date() })
        .where(and(eq(pickups.id, id), eq(pickups.status, pickupFrom)))
        .returning({ id: pickups.id });
      if (updated.length === 0) {
        throw new ConflictException(`Pickup '${id}' changed concurrently`);
      }
    });
    return this.getById(id);
  }

  private async toResponse(row: PickupRow): Promise<PickupResponseDto> {
    const links = await this.database.db
      .select({ orderId: pickupOrders.orderId })
      .from(pickupOrders)
      .where(eq(pickupOrders.pickupId, row.id))
      .orderBy(asc(pickupOrders.orderId));
    return toPickupResponse(
      row,
      links.map((link) => link.orderId),
    );
  }

  private async pickupOrThrow(id: string): Promise<PickupRow> {
    const row = await this.database.db.query.pickups.findFirst({
      where: eq(pickups.id, id),
    });
    if (!row) throw new NotFoundException(`Pickup '${id}' not found`);
    return row;
  }
}
