import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { CustomersService } from './customers.service.js';

function baseCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Ma Aye Chan',
    phone: '09777888999',
    address: 'No. 4, U Htaung Bo Road, Yangon',
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CustomersService', () => {
  let service: CustomersService;

  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const database = { db };

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
    mockSelectRows([baseCustomer()]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  describe('list', () => {
    it('returns paged results with pagination metadata', async () => {
      db.select.mockReset();
      const from = vi
        .fn()
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi
                .fn()
                .mockResolvedValue([
                  baseCustomer(),
                  baseCustomer(),
                  baseCustomer({ id: '66666666-6666-4666-8666-666666666666' }),
                ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        });
      db.select.mockReturnValue({ from });

      const result = await service.list({ page: 1, perPage: 2 });

      expect(result.data).toHaveLength(3);
      expect(result.meta.total).toBe(3);
      expect(result.meta.totalPages).toBe(2);
    });
  });

  describe('getById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      mockSelectRows([]);
      await expect(
        service.getById('11111111-1111-4111-8111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns customer fields', async () => {
      const result = await service.getById(
        '55555555-5555-4555-8555-555555555555',
      );
      expect(result.name).toBe('Ma Aye Chan');
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('create', () => {
    it('inserts a customer and returns the response DTO', async () => {
      const insertedId = '77777777-7777-4777-8777-777777777777';
      // Read-back select must return the inserted row (create re-reads via getById).
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([baseCustomer({ id: insertedId })]),
          }),
        }),
      });
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: insertedId }]),
        }),
      });

      const result = await service.create({
        name: 'Ma Aye Chan',
        phone: '09111122233',
      });

      expect(result.id).toBe(insertedId);
      const values = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(values).toMatchObject({
        name: 'Ma Aye Chan',
        phone: '09111122233',
        address: null,
        notes: null,
      });
    });
  });

  describe('update', () => {
    it('throws when the target customer does not exist', async () => {
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

      await service.update('55555555-5555-4555-8555-555555555555', {
        phone: '09333444555',
      });

      const setPayload = db.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setPayload).not.toHaveProperty('name');
      expect(setPayload.phone).toBe('09333444555');
      expect(setPayload.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('remove', () => {
    it('deletes an existing customer', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      await expect(
        service.remove('55555555-5555-4555-8555-555555555555'),
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
