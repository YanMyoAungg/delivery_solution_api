import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { OrderStateService } from './order-state.service.js';
import { ORDER_STATUSES, type OrderStatus } from './order.schema.js';

const EXPECTED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PICKED_UP'],
  PICKED_UP: ['RECEIVED_AT_OFFICE'],
  RECEIVED_AT_OFFICE: ['ASSIGNED'],
  ASSIGNED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'RETURNED'],
  FAILED: ['ASSIGNED'],
  DELIVERED: [],
  RETURNED: [],
};

function updateChain(returning: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returning),
      }),
    }),
  };
}

describe('OrderStateService', () => {
  let service: OrderStateService;

  const tx = {
    update: vi.fn(),
    insert: vi.fn(),
  };
  const db = {
    transaction: vi.fn(),
  };
  const database = { db };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderStateService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();
    service = moduleRef.get(OrderStateService);
  });

  it('exposes exactly the roadmap transition matrix', () => {
    for (const status of ORDER_STATUSES) {
      expect(service.getAllowedTransitions(status)).toEqual(
        EXPECTED_TRANSITIONS[status],
      );
    }
  });

  it('allows every edge in the matrix and rejects the complement', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const expected = EXPECTED_TRANSITIONS[from].includes(to);
        expect(service.canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('rejects a terminal-state transition with BadRequestException', () => {
    expect(() => service.assertTransition('DELIVERED', 'PENDING')).toThrow(
      BadRequestException,
    );
    expect(() => service.assertTransition('PENDING', 'DELIVERED')).toThrow(
      BadRequestException,
    );
  });

  it('applies an allowed transition and appends history atomically', async () => {
    tx.update.mockReturnValue(updateChain([{ id: 'order-1' }]));
    tx.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    db.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
    );

    await service.applyTransition({
      orderId: 'order-1',
      fromStatus: 'PENDING',
      toStatus: 'PICKED_UP',
      changedBy: 'user-1',
    });

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    const inserted = tx.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(inserted).toMatchObject({
      orderId: 'order-1',
      fromStatus: 'PENDING',
      toStatus: 'PICKED_UP',
      changedBy: 'user-1',
    });
  });

  it('rejects an invalid transition before touching the database', async () => {
    await expect(
      service.applyTransition({
        orderId: 'order-1',
        fromStatus: 'PENDING',
        toStatus: 'DELIVERED',
        changedBy: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('raises ConflictException when the order is not in the expected status', async () => {
    tx.update.mockReturnValue(updateChain([]));
    tx.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    db.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
    );

    await expect(
      service.applyTransition({
        orderId: 'order-1',
        fromStatus: 'PENDING',
        toStatus: 'PICKED_UP',
        changedBy: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
