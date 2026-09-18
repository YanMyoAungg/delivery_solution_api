import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { CustomersService } from './customers.service.js';

function baseCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Aung Aung',
    phone: '09123456789',
    address: 'Main Road',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CustomersService', () => {
  let service: CustomersService;

  const queryCustomers = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const db = {
    query: { customers: queryCustomers },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const database = { db };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();
    service = moduleRef.get(CustomersService);
  });

  it('lists customers with pagination metadata', async () => {
    queryCustomers.findMany.mockResolvedValue([baseCustomer()]);
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    });

    const result = await service.list({ page: 1, perPage: 20 });

    expect(result.data[0].name).toBe('Aung Aung');
    expect(result.meta).toEqual({
      page: 1,
      perPage: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('throws NotFoundException for an unknown customer', async () => {
    queryCustomers.findFirst.mockResolvedValue(undefined);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a customer with trimmed name and nullable optional fields', async () => {
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([baseCustomer()]),
      }),
    });

    const result = await service.create({ name: ' Aung Aung ' });

    expect(result.id).toBe(baseCustomer().id);
    expect(db.insert.mock.results[0].value.values).toHaveBeenCalledWith({
      name: 'Aung Aung',
      phone: null,
      address: null,
    });
  });

  it('updates a customer after confirming it exists', async () => {
    queryCustomers.findFirst.mockResolvedValue(baseCustomer());
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([baseCustomer({ name: 'Updated Customer' })]),
        }),
      }),
    });

    const result = await service.update(baseCustomer().id, {
      name: 'Updated Customer',
    });

    expect(result.name).toBe('Updated Customer');
  });

  it('deletes an existing customer', async () => {
    queryCustomers.findFirst.mockResolvedValue(baseCustomer());
    db.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    await expect(service.remove(baseCustomer().id)).resolves.toBeUndefined();
    expect(db.delete).toHaveBeenCalled();
  });
});
