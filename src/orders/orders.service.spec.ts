import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { OrdersService } from './orders.service.js';

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    trackingCode: 'ORD-01J8ZQ4C7M3W9X2K5T8R1V6B0P',
    shopId: '22222222-2222-4222-8222-222222222222',
    customerId: '33333333-3333-4333-8333-333333333333',
    packageInfo: null,
    deliveryFee: '0.00',
    codAmount: '0.00',
    status: 'PENDING' as const,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function baseHistory(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    orderId: baseOrder().id,
    fromStatus: null,
    toStatus: 'PENDING' as const,
    changedBy: '55555555-5555-4555-8555-555555555555',
    note: 'Order registered',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function queryChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockReturnValue(chain);
  return chain;
}

describe('OrdersService', () => {
  let service: OrdersService;

  const queryShops = { findFirst: vi.fn() };
  const queryCustomers = { findFirst: vi.fn() };
  const db = {
    query: { shops: queryShops, customers: queryCustomers },
    select: vi.fn(),
    transaction: vi.fn(),
  };
  const database = { db };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: DatabaseService, useValue: database }],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('lists orders with pagination metadata', async () => {
    db.select
      .mockReturnValueOnce(queryChain([baseOrder()]))
      .mockReturnValueOnce(queryChain([{ count: 1 }]));

    const result = await service.list({ page: 1, perPage: 20 });

    expect(result.data[0].trackingCode).toBe(
      'ORD-01J8ZQ4C7M3W9X2K5T8R1V6B0P',
    );
    expect(result.data[0].deliveryFee).toBe('0.00');
    expect(result.meta).toEqual({
      page: 1,
      perPage: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('throws NotFoundException for an unknown order', async () => {
    db.select.mockReturnValue(queryChain([]));
    await expect(service.getById(baseOrder().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns an order with its history', async () => {
    db.select
      .mockReturnValueOnce(queryChain([baseOrder()]))
      .mockReturnValueOnce(queryChain([baseHistory()]));

    const result = await service.getById(baseOrder().id);

    expect(result.status).toBe('PENDING');
    expect(result.history).toHaveLength(1);
    expect(result.history[0].fromStatus).toBeNull();
    expect(result.history[0].toStatus).toBe('PENDING');
  });

  it('creates a PENDING order and initial history in one transaction', async () => {
    queryShops.findFirst.mockResolvedValue({ id: baseOrder().shopId });
    queryCustomers.findFirst.mockResolvedValue({ id: baseOrder().customerId });

    const orderInsert = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([baseOrder()]),
      }),
    };
    const historyInsert = {
      values: vi.fn().mockResolvedValue(undefined),
    };
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(orderInsert)
        .mockReturnValueOnce(historyInsert),
    };
    db.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    const result = await service.create(
      {
        shopId: baseOrder().shopId,
        customerId: baseOrder().customerId,
      },
      '55555555-5555-4555-8555-555555555555',
    );

    expect(result.status).toBe('PENDING');
    expect(result.trackingCode).toMatch(/^ORD-/);
    const orderValues = orderInsert.values.mock.calls[0][0] as {
      status: string;
      deliveryFee: string;
      codAmount: string;
    };
    expect(orderValues.status).toBe('PENDING');
    expect(orderValues.deliveryFee).toBe('0');
    expect(orderValues.codAmount).toBe('0');
    expect(historyInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: baseOrder().id,
        fromStatus: null,
        toStatus: 'PENDING',
      }),
    );
  });

  it('rejects an order for a missing shop or customer', async () => {
    queryShops.findFirst.mockResolvedValue(undefined);
    await expect(
      service.create(
        { shopId: baseOrder().shopId, customerId: baseOrder().customerId },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    queryShops.findFirst.mockResolvedValue({ id: baseOrder().shopId });
    queryCustomers.findFirst.mockResolvedValue(undefined);
    await expect(
      service.create(
        { shopId: baseOrder().shopId, customerId: baseOrder().customerId },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
