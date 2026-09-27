import {
  DELIVERY_HISTORY_EVENTS,
  DELIVERY_STATUSES,
  FAILURE_REASONS,
} from './delivery.schema.js';
import { MAX_DELIVERY_ATTEMPTS } from './deliveries.service.js';

describe('Delivery workflow contract', () => {
  it('locks the bounded attempt and status vocabulary', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
    expect(DELIVERY_STATUSES).toEqual([
      'ASSIGNED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
    ]);
    expect(FAILURE_REASONS).toEqual([
      'CUSTOMER_UNAVAILABLE',
      'WRONG_ADDRESS',
      'CUSTOMER_REFUSED',
      'CUSTOMER_RESCHEDULED',
      'DAMAGED_PACKAGE',
      'OTHER',
    ]);
    expect(DELIVERY_HISTORY_EVENTS).toContain('RETRY_CREATED');
    expect(DELIVERY_HISTORY_EVENTS).toContain('REASSIGNED');
  });
});
