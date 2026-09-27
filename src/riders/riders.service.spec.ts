import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { RidersService } from './riders.service.js';

function baseRiderUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    name: 'Ko Zaw Min',
    email: 'zaw-min@example.com',
    phone: '09666777888',
    passwordHash: '$2b$10$hashed',
    roleId: '99999999-9999-4999-8999-999999999999',
    status: 'ACTIVE',
    passwordChangedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function baseRider(overrides: Record<string, unknown> = {}) {
  return {
    userId: '88888888-8888-4888-8888-888888888888',
    licenseNo: 'DL-123456',
    vehicleType: 'BIKE',
    vehiclePlate: 'YGN-1A/234',
    nrcNumber: '12/YGN(N)123456',
    emergencyContactPhone: '09700011122',
    isAvailable: true,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('RidersService', () => {
  let service: RidersService;

  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  const database = { db };

  /** Shared fake tx used by every mocked transaction. */
  const fakeTx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    db.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        RidersService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = moduleRef.get(RidersService);
  });

  /** Chain for `select({ rider, user }).from(riders).innerJoin(users).where().limit()` — first call resolves given rows. */
  function joinedSelect(rows: unknown[], secondRows: unknown[] = []) {
    const first = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    };
    const second = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(secondRows),
          }),
        }),
      }),
    };
    if (secondRows.length > 0) {
      // Two joined selects inside one method — first existing-check, second read-back.
      fakeTx.select
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second)
        .mockReturnValue(first);
      return { first, second };
    }
    fakeTx.select.mockReturnValue(first);
    return { first, second };
  }

  /** Non-tx joined select used by findRawById (getById/list count paths). */
  function dbJoinedSelect(rows: unknown[]) {
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    });
  }

  describe('getById', () => {
    it('throws NotFoundException for unknown id', async () => {
      dbJoinedSelect([]);
      await expect(
        service.getById('11111111-1111-4111-8111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns joined rider + user shape without password material', async () => {
      const user = baseRiderUser();
      const rider = baseRider();
      dbJoinedSelect([{ rider, user }]);

      const result = await service.getById(user.id);

      expect(result.userId).toBe(user.id);
      expect(result.user.email).toBe(user.email);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.status).toBe('ACTIVE');
    });
  });

  describe('list', () => {
    it('returns paged joined results with metadata', async () => {
      const user = baseRiderUser();
      const rider = baseRider();
      const otherRider = baseRider({
        userId: '99999999-9999-4999-8999-999999999999',
      });

      db.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([
                      { rider, user },
                      {
                        rider: otherRider,
                        user: baseRiderUser({
                          id: otherRider.userId,
                          name: 'U Myint',
                        }),
                      },
                    ]),
                  }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 2 }]),
            }),
          }),
        });

      const result = await service.list({ page: 1, perPage: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].userId).toBe(rider.userId);
      expect(result.data[1].user.name).toBe('U Myint');
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('builds filters from vehicleType and isAvailable', async () => {
      db.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          }),
        });

      const result = await service.list({
        vehicleType: 'BIKE',
        isAvailable: true,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('create', () => {
    const baseCreateDto = {
      name: 'Ko Zaw Min',
      email: 'zaw-min@example.com',
      password: 'password123',
      vehicleType: 'BIKE' as const,
    };

    it('inserts users (RIDER role forced) + riders in one transaction', async () => {
      const roleId = '77777777-7777-4777-8777-777777777777';
      const user = baseRiderUser();
      const rider = baseRider();

      // 1st select: role lookup; 2nd select: joined read-back.
      fakeTx.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: roleId }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ rider, user }]),
              }),
            }),
          }),
        });

      fakeTx.insert
        .mockImplementationOnce(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: user.id }]),
          }),
        }))
        .mockImplementationOnce(() => ({
          values: vi.fn().mockResolvedValue([{ userId: user.id }]),
        }));

      const result = await service.create(baseCreateDto);

      expect(result.userId).toBe(user.id);
      expect(result.user.email).toBe(user.email);

      const userPayload =
        fakeTx.insert.mock.results[0].value.values!.mock.calls[0][0];
      expect(userPayload.roleId).toBe(roleId);
      expect(userPayload.passwordChangedAt).toBeInstanceOf(Date);
      expect(userPayload.status).toBe('ACTIVE');

      const riderPayload =
        fakeTx.insert.mock.results[1].value.values!.mock.calls[0][0];
      expect(riderPayload.userId).toBe(user.id);
    });

    it('throws NotFoundException when RIDER role missing', async () => {
      fakeTx.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.create(baseCreateDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates rider profile only when profile fields passed', async () => {
      const user = baseRiderUser();
      const rider = baseRider();
      joinedSelect([{ rider, user }], [{ rider, user }]);

      // Service updates users first, then riders — record both payloads in order.
      const setPayloads: Array<Record<string, unknown>> = [];
      fakeTx.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          setPayloads.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      }));

      await service.update(user.id, { isAvailable: false });

      expect(fakeTx.update).toHaveBeenCalledTimes(2);
      expect(setPayloads[0]).not.toHaveProperty('name');
      expect(setPayloads[0].updatedAt).toBeInstanceOf(Date);
      expect(setPayloads[1].isAvailable).toBe(false);
      expect(setPayloads[1]).not.toHaveProperty('name');
    });

    it('throws for unknown id, skipping updates', async () => {
      joinedSelect([]);

      await expect(
        service.update('11111111-1111-4111-8111-111111111111', {
          isAvailable: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeTx.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes riders row then users row in one transaction', async () => {
      const user = baseRiderUser();
      joinedSelect([]);

      // remove() does its own non-joined rider existence check inside tx.
      fakeTx.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ userId: user.id }]),
          }),
        }),
      });

      const ridersDelete = { where: vi.fn().mockResolvedValue(undefined) };
      const usersDelete = { where: vi.fn().mockResolvedValue(undefined) };
      fakeTx.delete
        .mockReturnValueOnce(ridersDelete)
        .mockReturnValueOnce(usersDelete);

      await expect(service.remove(user.id)).resolves.toBeUndefined();

      expect(fakeTx.delete).toHaveBeenCalledTimes(2);
      // Order checked by queue: riders first, users second.
    });

    it('throws for unknown id without deleting anything', async () => {
      fakeTx.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.remove('11111111-1111-4111-8111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fakeTx.delete).not.toHaveBeenCalled();
    });
  });
});
