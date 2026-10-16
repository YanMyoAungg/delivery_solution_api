import { deriveWayFinancialState } from './way-state.util.js';

describe('deriveWayFinancialState', () => {
  const rate = '500.00';

  it('returns EMPTY for a way without orders', () => {
    expect(deriveWayFinancialState(0, 0, false, rate)).toEqual({
      state: 'EMPTY', commissionAmount: '0.00', pendingAmount: '0.00',
    });
  });

  it('returns PENDING_APPROVAL with a separate pending amount', () => {
    expect(deriveWayFinancialState(2, 0, false, rate)).toEqual({
      state: 'PENDING_APPROVAL', commissionAmount: '0.00', pendingAmount: rate,
    });
  });

  it('returns EARNED once at least one order is delivered', () => {
    expect(deriveWayFinancialState(2, 1, false, rate)).toEqual({
      state: 'EARNED', commissionAmount: rate, pendingAmount: '0.00',
    });
  });

  it('keeps PAID_ANYWAY distinct even if a delivered count is passed', () => {
    expect(deriveWayFinancialState(2, 1, true, rate)).toEqual({
      state: 'PAID_ANYWAY', commissionAmount: rate, pendingAmount: '0.00',
    });
  });
});
