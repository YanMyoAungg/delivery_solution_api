import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { ShopsService } from './shops.service.js';

function baseShop(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Central Shop',
    phone: '09123456789',
    address: 'Main Road',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ShopsService', () => {
  let service: ShopsService;

  const queryShops = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const db = {
    query: { shops: queryShops },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const database = { db };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ShopsService, { provide: DatabaseService, useValue: database }],
    }).compile();
    service = moduleRef.get(ShopsService);
  });

  it('lists shops with pagination metadata', async () => {
    queryShops.findMany.mockResolvedValue([baseShop()]);
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    });

    const result = await service.list({ page: 1, perPage: 20 });

    expect(result.data[0].name).toBe('Central Shop');
    expect(result.meta).toEqual({
      page: 1,
      perPage: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('throws NotFoundException for an unknown shop', async () => {
    queryShops.findFirst.mockResolvedValue(undefined);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a shop and returns a response without database internals', async () => {
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([baseShop()]),
      }),
    });

    const result = await service.create({
      name: ' Central Shop ',
      phone: '09123456789',
      address: 'Main Road',
    });

    expect(result.id).toBe(baseShop().id);
    expect(db.insert.mock.results[0].value.values).toHaveBeenCalledWith({
      name: 'Central Shop',
      phone: '09123456789',
      address: 'Main Road',
    });
  });

  it('maps a unique violation to ConflictException', async () => {
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({
          code: '23505',
        }),
      }),
    });

    await expect(service.create({ name: 'Central Shop' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updates a shop after confirming it exists', async () => {
    queryShops.findFirst.mockResolvedValue(baseShop());
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([baseShop({ name: 'Updated' })]),
        }),
      }),
    });

    const result = await service.update(baseShop().id, { name: 'Updated' });

    expect(result.name).toBe('Updated');
  });

  it('deletes an existing shop', async () => {
    queryShops.findFirst.mockResolvedValue(baseShop());
    db.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    await expect(service.remove(baseShop().id)).resolves.toBeUndefined();
    expect(db.delete).toHaveBeenCalled();
  });
});
