import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { orderStatusHistory } from './order-status-history.schema.js';
import { orders, type OrderStatus } from './order.schema.js';

type OrderStateExecutor = Pick<
  typeof DatabaseService.prototype.db,
  'update' | 'insert'
>;

/** Allowed transitions for an order already received and assigned by the office. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  ASSIGNED: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: ['ASSIGNED'],
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
      await this.applyTransitionInTransaction(tx, params);
    });
  }

  async applyTransitionInTransaction(
    tx: OrderStateExecutor,
    params: ApplyTransitionParams,
  ): Promise<void> {
    this.assertTransition(params.fromStatus, params.toStatus);

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
  }
}
