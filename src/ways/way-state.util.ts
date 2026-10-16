import type { WayState } from './dto/way-state.js';

export interface WayFinancialState {
  state: WayState;
  commissionAmount: string;
  pendingAmount: string;
}

export function deriveWayFinancialState(
  orderCount: number,
  deliveredOrderCount: number,
  isPaidWithoutDelivery: boolean,
  commissionRate: string,
): WayFinancialState {
  if (isPaidWithoutDelivery) {
    return { state: 'PAID_ANYWAY', commissionAmount: commissionRate, pendingAmount: '0.00' };
  }
  if (deliveredOrderCount > 0) {
    return { state: 'EARNED', commissionAmount: commissionRate, pendingAmount: '0.00' };
  }
  if (orderCount > 0) {
    return { state: 'PENDING_APPROVAL', commissionAmount: '0.00', pendingAmount: commissionRate };
  }
  return { state: 'EMPTY', commissionAmount: '0.00', pendingAmount: '0.00' };
}
