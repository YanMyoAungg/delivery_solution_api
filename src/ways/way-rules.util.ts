import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { OrderStatus } from '../orders/order.schema.js';

export interface MovableWayOrder {
  id: string;
  wayId: string | null;
  status: OrderStatus;
}

export function assertOrdersCanMoveBetweenWays(
  sourceWayId: string,
  sourceRiderId: string,
  targetWayId: string,
  targetRiderId: string,
  selectedOrders: readonly MovableWayOrder[],
): void {
  if (sourceWayId === targetWayId) {
    throw new BadRequestException('Source and target ways must be different');
  }
  if (sourceRiderId !== targetRiderId) {
    throw new BadRequestException('Orders can only move between ways belonging to the same rider');
  }
  for (const order of selectedOrders) {
    if (order.status !== 'ASSIGNED' && order.status !== 'AWAITING_APPROVAL') {
      throw new BadRequestException(`Order '${order.id}' cannot be moved in its current status`);
    }
    if (order.wayId !== sourceWayId) {
      throw new BadRequestException('Every order must belong to the source way');
    }
  }
}

export function assertCanPayWayAnyway(isPaidWithoutDelivery: boolean, deliveredOrderCount: number): void {
  if (isPaidWithoutDelivery) throw new ConflictException('Way has already been paid anyway');
  if (deliveredOrderCount > 0) {
    throw new ConflictException('A way with a delivered order cannot be paid anyway');
  }
}

export function assertCanOverrideCommission(effectivePermissions: readonly string[]): void {
  if (!effectivePermissions.includes('ways.override_commission')) {
    throw new ForbiddenException('Changing a commission rate requires ways.override_commission');
  }
}
