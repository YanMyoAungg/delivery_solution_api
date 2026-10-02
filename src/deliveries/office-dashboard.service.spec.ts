import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../common/database/database.service.js';
import { OfficeDashboardService } from './office-dashboard.service.js';

function queryChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

describe('OfficeDashboardService', () => {
  const db = { select: vi.fn() };
  let service: OfficeDashboardService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficeDashboardService,
        { provide: DatabaseService, useValue: { db } },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue('Asia/Yangon') } },
      ],
    }).compile();
    service = moduleRef.get(OfficeDashboardService);
  });

  it('returns selected-date totals, current work, activity, and retryable failures', async () => {
    db.select
      .mockReturnValueOnce(queryChain([{ count: 3 }]))
      .mockReturnValueOnce(queryChain([
        { orderId: 'order-1', riderId: 'rider-1', riderName: 'Rider One', townshipId: 'town-1', townshipName: 'Hlaing' },
        { orderId: 'order-2', riderId: 'rider-1', riderName: 'Rider One', townshipId: 'town-1', townshipName: 'Hlaing' },
      ]))
      .mockReturnValueOnce(queryChain([
        { orderId: 'order-1', attemptNumber: 1, status: 'DELIVERED' },
        { orderId: 'order-2', attemptNumber: 1, status: 'DELIVERED' },
        { orderId: 'order-3', attemptNumber: 1, status: 'DELIVERED' },
        { orderId: 'order-4', attemptNumber: 1, status: 'FAILED' },
        { orderId: 'order-5', attemptNumber: 2, status: 'DELIVERED' },
        { orderId: 'order-5', attemptNumber: 1, status: 'FAILED' },
      ]))
      .mockReturnValueOnce(queryChain([
        { id: 'event-1', orderId: 'order-1', trackingCode: 'ORD-1', townshipName: 'Hlaing', riderId: 'rider-1', riderName: 'Rider One', previousRiderName: null, previousRiderId: null, newRiderId: 'rider-1', event: 'DELIVERED', createdAt: new Date('2026-10-03T08:00:00.000Z') },
      ]))
      .mockReturnValueOnce(queryChain([
        { orderId: 'order-3', trackingCode: 'ORD-3', townshipName: 'Hlaing', riderName: 'Rider One', attemptNumber: 2, failedAt: new Date('2026-10-03T09:00:00.000Z') },
      ]));

    await expect(service.getDashboard('2026-10-03')).resolves.toMatchObject({
      date: '2026-10-03',
      summary: { ordersCreated: 3, openAssignments: 2, delivered: 4, failed: 2, successRate: 66.67 },
      openWork: [{ riderId: 'rider-1', townshipId: 'town-1', count: 2 }],
      recentActivity: [{ id: 'event-1', riderName: 'Rider One' }],
      failedOrders: [{ orderId: 'order-3', attemptNumber: 2 }],
    });
    expect(db.select).toHaveBeenCalledTimes(5);
  });

  it('returns zero success rate when no delivery attempts completed that date', async () => {
    db.select
      .mockReturnValueOnce(queryChain([{ count: 0 }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    await expect(service.getDashboard('2026-10-03')).resolves.toMatchObject({
      summary: { ordersCreated: 0, openAssignments: 0, successRate: 0 },
      openWork: [],
      recentActivity: [],
      failedOrders: [],
    });
  });
});
