import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  assertCanOverrideCommission,
  assertCanPayWayAnyway,
  assertOrdersCanMoveBetweenWays,
} from './way-rules.util.js';

describe('way rules', () => {
  it('allows assigned and awaiting-approval orders to move within one rider’s ways', () => {
    expect(() => assertOrdersCanMoveBetweenWays(
      'source', 'rider', 'target', 'rider',
      [
        { id: 'assigned', wayId: 'source', status: 'ASSIGNED' },
        { id: 'awaiting', wayId: 'source', status: 'AWAITING_APPROVAL' },
      ],
    )).not.toThrow();
  });

  it.each([
    ['delivered order', [{ id: 'order', wayId: 'source', status: 'DELIVERED' as const }]],
    ['order not in source way', [{ id: 'order', wayId: 'other', status: 'ASSIGNED' as const }]],
  ])('rejects a move for a %s', (_description, selectedOrders) => {
    expect(() => assertOrdersCanMoveBetweenWays(
      'source', 'rider', 'target', 'rider', selectedOrders,
    )).toThrow(BadRequestException);
  });

  it('rejects moving orders between different riders', () => {
    expect(() => assertOrdersCanMoveBetweenWays(
      'source', 'rider-one', 'target', 'rider-two',
      [{ id: 'order', wayId: 'source', status: 'ASSIGNED' }],
    )).toThrow(BadRequestException);
  });

  it('permits pay-anyway only once and only before any delivery is approved', () => {
    expect(() => assertCanPayWayAnyway(false, 0)).not.toThrow();
    expect(() => assertCanPayWayAnyway(true, 0)).toThrow(ConflictException);
    expect(() => assertCanPayWayAnyway(false, 1)).toThrow(ConflictException);
  });

  it('requires the explicit commission override permission', () => {
    expect(() => assertCanOverrideCommission(['ways.read'])).toThrow(ForbiddenException);
    expect(() => assertCanOverrideCommission(['ways.override_commission'])).not.toThrow();
  });
});
