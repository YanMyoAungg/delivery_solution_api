import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { orderStatusHistory } from './order-status-history.schema.js';
import { orders, type OrderStatus } from './order.schema.js';

/**
 * Allowed order-status transitions derived from the Phase 3 roadmap:
 * PENDING → PICKED_UP → RECEIVED_AT_OFFICE → ASSIGNED → OUT_FOR_DELIVERY
 * → DELIVERED | FAILED | RETURNED, plus the documented FAILED → ASSIGNED
 * retry edge used by the delivery attempt ledger.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PICKED_UP'],
  PICKED_UP: ['RECEIVED_AT_OFFICE'],
  RECEIVED_AT_OFFICE: ['ASSIGNED'],
  ASSIGNED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'RETURNED'],
  FAILED: ['ASSIGNED'],
  DELIVERED: [],
  RETURNED: [],
};

export interface ApplyTransitionParams {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedBy: string;
  note?: string;
}

@Injectable()
export class OrderStateService {
  constructor(private readonly database: DatabaseService) {}

  getAllowedTransitions(status: OrderStatus): readonly OrderStatus[] {
    return ALLOWED_TRANSITIONS[status];
  }

  canTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
    return this.getAllowedTransitions(fromStatus).includes(toStatus);
  }

  assertTransition(fromStatus: OrderStatus, toStatus: OrderStatus): void {
    if (!this.canTransition(fromStatus, toStatus)) {
      throw new BadRequestException(
        `Invalid order status transition: ${fromStatus} -> ${toStatus}`,
      );
    }
  }

  /**
   * Apply a permitted transition and append its history row atomically. The
   * update is guarded by the expected current status so concurrent writers
   * cannot double-apply a transition.
   */
  async applyTransition(params: ApplyTransitionParams): Promise<void> {
    this.assertTransition(params.fromStatus, params.toStatus);

    await this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(orders)
        .set({ status: params.toStatus, updatedAt: new Date() })
        .where(
          and(
            eq(orders.id, params.orderId),
            eq(orders.status, params.fromStatus),
          ),
        )
        .returning({ id: orders.id });

      if (updated.length === 0) {
        throw new ConflictException(
          `Order '${params.orderId}' is not in status '${params.fromStatus}'`,
        );
      }

      await tx.insert(orderStatusHistory).values({
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        changedBy: params.changedBy,
        note: params.note ?? null,
      });
    });
  }
}
