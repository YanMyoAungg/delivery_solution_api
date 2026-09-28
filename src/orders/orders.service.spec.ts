import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { OrdersService, toOrderResponse } from './orders.service.js';

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    trackingCode: 'ORD-01J8ZQ4C7M3W9X2K5T8R1V6B0P',
    shopId: '22222222-2222-4222-8222-222222222222',
    customerId: '33333333-3333-4333-8333-333333333333',
    townshipId: '44444444-4444-4444-8444-444444444444',
    packageInfo: null,
    deliveryFee: '0.00',
    codAmount: '0.00',
    status: 'ASSIGNED' as const,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function queryChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockReturnValue(chain);
  return chain;
}

describe('OrdersService', () => {
  let service: OrdersService;
  const db = { select: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: DatabaseService, useValue: { db } }],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('maps township and latest-rider details into an office order response', () => {
    const response = toOrderResponse(baseOrder(), {
      riderId: '55555555-5555-4555-8555-555555555555',
      riderName: 'Rider One',
      riderPhone: '09123456789',
      townshipName: 'Hlaing',
    });

    expect(response).toMatchObject({
      status: 'ASSIGNED',
      townshipId: baseOrder().townshipId,
      townshipName: 'Hlaing',
      riderName: 'Rider One',
      riderPhone: '09123456789',
    });
  });

  it('lists orders with pagination metadata and latest assignment', async () => {
    db.select
      .mockReturnValueOnce(queryChain([baseOrder()]))
      .mockReturnValueOnce(queryChain([{ count: 1 }]))
      .mockReturnValueOnce(
        queryChain([
          {
            orderId: baseOrder().id,
            riderId: '55555555-5555-4555-8555-555555555555',
            riderName: 'Rider One',
            riderPhone: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryChain([{ id: baseOrder().townshipId, name: 'Hlaing' }]),
      );

    const result = await service.list({ page: 1, perPage: 20 });

    expect(result.data[0]).toMatchObject({
      trackingCode: baseOrder().trackingCode,
      townshipName: 'Hlaing',
      riderName: 'Rider One',
      deliveryFee: '0.00',
    });
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
});
