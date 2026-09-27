import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { ShopsService } from './shops.service.js';

function baseShop(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Yangon Fresh Market',
    phone: '09123456789',
    address: 'No. 12, Bogyoke Road, Yangon',
    notes: null,
    channelType: 'VIBER',
    channelName: 'Yangon Fresh Market Group',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ShopsService', () => {
  let service: ShopsService;

  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const database = { db };

  /** Fresh select chain resolving the given rows from a `where().limit()` call. */
  function mockSelectRows(rows: unknown[]) {
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
          offset: vi.fn().mockResolvedValue(rows),
        }),
      }),
    });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    mockSelectRows([baseShop()]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ShopsService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = moduleRef.get(ShopsService);
  });

  describe('list', () => {
    it('returns paged results with pagination metadata', async () => {
      db.select.mockReset();
      const from = vi
        .fn()
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([baseShop(), baseShop()]),
            }),
          }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        });
      db.select.mockReturnValue({ from });

      const result = await service.list({ page: 1, perPage: 2 });

      expect(result.data).toHaveLength(2);
      expect(result).not.toHaveProperty('chatId');
      expect(result.data[0]).not.toHaveProperty('chatId');
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('getById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      mockSelectRows([]);
      await expect(
        service.getById('11111111-1111-4111-8111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns a shop without chatId in the response', async () => {
      const result = await service.getById(
        '33333333-3333-4333-8333-333333333333',
      );
      expect(result).not.toHaveProperty('chatId');
      expect(result.name).toBe('Yangon Fresh Market');
    });
  });

  describe('create', () => {
    it('inserts a shop and returns the response DTO', async () => {
      const insertedId = '44444444-4444-4444-8444-444444444444';
      // Read-back select must return the inserted row (create re-reads via getById).
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([baseShop({ id: insertedId })]),
          }),
        }),
      });
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: insertedId }]),
        }),
      });

      const result = await service.create({
        name: 'New Shop',
        channelType: 'TELEGRAM',
        channelName: 'New Shop Group',
      });

      expect(result.id).toBe(insertedId);
      expect(result).not.toHaveProperty('chatId');
    });

    it('rejects a duplicate shop name', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockRejectedValue({
              code: '23505',
              detail: 'name already exists',
            }),
        }),
      });

      await expect(
        service.create({
          name: 'Duplicate Shop',
          channelType: 'VIBER',
          channelName: 'Duplicate Shop Group',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows non-unique DB errors', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('other db error')),
        }),
      });

      await expect(
        service.create({
          name: 'Broken Shop',
          channelType: 'VIBER',
          channelName: 'Broken Shop Group',
        }),
      ).rejects.not.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('throws when the target shop does not exist', async () => {
      mockSelectRows([]);
      await expect(
        service.update('11111111-1111-4111-8111-111111111111', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await service.update(
        '33333333-3333-4333-8333-333333333333',
        { name: 'Renamed Shop' },
      );

      expect(result).not.toHaveProperty('chatId');
      const setPayload = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setPayload.name).toBe('Renamed Shop');
      expect(setPayload.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('remove', () => {
    it('deletes an existing shop', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      await expect(
        service.remove('33333333-3333-4333-8333-333333333333'),
      ).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalled();
    });

    it('throws for an unknown id', async () => {
      mockSelectRows([]);
      await expect(
        service.remove('11111111-1111-4111-8111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
