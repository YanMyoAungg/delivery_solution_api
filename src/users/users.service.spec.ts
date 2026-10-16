import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../common/database/database.service.js';
import { PermissionService } from '../permissions/permissions.service.js';
import { UsersService } from './users.service.js';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Officer',
    email: 'officer@delivery.local',
    phone: '09123',
    roleId: 'r-officer',
    shopId: null,
    role: { name: 'OFFICER' },
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;

  const queryUsers = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const queryRoles = { findFirst: vi.fn() };
  const queryShops = { findFirst: vi.fn() };
  const db = {
    query: { users: queryUsers, roles: queryRoles, shops: queryShops },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const database = { db };
  const permissions = {
    assertCallerCanAssign: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    });
    permissions.assertCallerCanAssign.mockResolvedValue(undefined);
    queryRoles.findFirst.mockResolvedValue({ id: 'r-officer', name: 'OFFICER' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: database },
        { provide: PermissionService, useValue: permissions },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('list', () => {
    it('returns paged results with pagination metadata', async () => {
      queryUsers.findMany.mockResolvedValue([baseUser()]);

      const result = await service.list({ page: 1, perPage: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('passwordHash');
      expect(result.data[0].roleId).toBe('r-officer');
      expect(result.meta).toEqual({
        page: 1,
        perPage: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('filters by roleId', async () => {
      queryUsers.findMany.mockResolvedValue([]);
      await service.list({ roleId: 'r-officer' });
      expect(queryUsers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    });
  });

  describe('getById', () => {
    it('throws NotFoundException for an unknown id', async () => {
      queryUsers.findFirst.mockResolvedValue(undefined);
      await expect(service.getById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns a sanitized user', async () => {
      queryUsers.findFirst.mockResolvedValue(baseUser());
      const result = await service.getById(
        '22222222-2222-4222-8222-222222222222',
      );
      expect(result.email).toBe('officer@delivery.local');
      expect(result.roleId).toBe('r-officer');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('create', () => {
    it('requires a shopId for SHOP users', async () => {
      queryRoles.findFirst.mockResolvedValue({ id: 'r-shop', name: 'SHOP' });
      await expect(service.create({
        name: 'Shop user',
        email: 'shop@delivery.local',
        roleId: 'r-shop',
        password: 'password1',
      }, 'caller-role-id')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a shopId for non-SHOP users', async () => {
      await expect(service.create({
        name: 'Officer',
        email: 'officer@delivery.local',
        roleId: 'r-officer',
        shopId: '11111111-1111-4111-8111-111111111111',
        password: 'password1',
      }, 'caller-role-id')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hashes the password, lowercases the email and persists the user', async () => {
      queryUsers.findFirst.mockResolvedValueOnce(undefined); // assertEmailAvailable
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: '22222222-2222-4222-8222-222222222222' },
            ]),
        }),
      });
      queryUsers.findFirst.mockResolvedValueOnce(baseUser()); // getById

      const result = await service.create(
        {
          name: 'Officer',
          email: 'Officer@Delivery.Local',
          roleId: 'r-officer',
          password: 'password1',
        },
        'caller-role-id',
      );

      expect(result.email).toBe('officer@delivery.local');
      expect(permissions.assertCallerCanAssign).toHaveBeenCalledWith(
        'caller-role-id',
        'r-officer',
      );
      const values = db.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(values.email).toBe('officer@delivery.local');
      expect(values.passwordHash.startsWith('$2')).toBe(true);
    });

    it('rejects a duplicate email', async () => {
      queryUsers.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create(
          {
            name: 'X',
            email: 'officer@delivery.local',
            roleId: 'r-officer',
            password: 'password1',
          },
          'c',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('maps the email constraint to the email conflict message', async () => {
      queryUsers.findFirst.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            cause: { code: '23505', constraint: 'users_email_unique' },
          }),
        }),
      });

      await expect(
        service.create(
          {
            name: 'Officer',
            email: 'Officer@Delivery.Local',
            roleId: 'r-officer',
            password: 'password1',
          },
          'caller-role-id',
        ),
      ).rejects.toThrow("User with email 'officer@delivery.local' already exists");
    });

    it('maps the shop constraint to the shop login conflict message', async () => {
      queryRoles.findFirst.mockResolvedValue({ id: 'r-shop', name: 'SHOP' });
      queryUsers.findFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      queryShops.findFirst.mockResolvedValue({
        id: 'shop-id',
        name: 'Central Shop',
      });
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            cause: { code: '23505', constraint_name: 'users_shop_unique' },
          }),
        }),
      });

      await expect(
        service.create(
          {
            name: 'Shop user',
            email: 'shop@delivery.local',
            roleId: 'r-shop',
            shopId: 'shop-id',
            password: 'password1',
          },
          'caller-role-id',
        ),
      ).rejects.toThrow("Shop 'Central Shop' already has a login user");
    });

    it('pre-checks whether a shop already has a login', async () => {
      queryRoles.findFirst.mockResolvedValue({ id: 'r-shop', name: 'SHOP' });
      queryUsers.findFirst
        .mockResolvedValueOnce({ id: 'existing-login' })
        .mockResolvedValueOnce(undefined);
      queryShops.findFirst.mockResolvedValue({
        id: 'shop-id',
        name: 'Central Shop',
      });

      await expect(
        service.create(
          {
            name: 'Shop user',
            email: 'shop@delivery.local',
            roleId: 'r-shop',
            shopId: 'shop-id',
            password: 'password1',
          },
          'caller-role-id',
        ),
      ).rejects.toThrow("Shop 'Central Shop' already has a login user");
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('uses a generic conflict for an unrecognized unique constraint', async () => {
      queryUsers.findFirst.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: '23505',
            constraint: 'users_unrecognized_unique',
          }),
        }),
      });

      await expect(
        service.create(
          {
            name: 'Officer',
            email: 'officer@delivery.local',
            roleId: 'r-officer',
            password: 'password1',
          },
          'caller-role-id',
        ),
      ).rejects.toThrow('A record with these details already exists');
    });
  });

  describe('update', () => {
    it('throws when the target user does not exist', async () => {
      queryUsers.findFirst.mockResolvedValue(undefined);
      await expect(
        service.update('missing', { name: 'Renamed' }, 'c'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks modifying an OWNER account', async () => {
      queryUsers.findFirst.mockResolvedValue(
        baseUser({ role: { name: 'OWNER' } }),
      );
      await expect(
        service.update('id', { status: 'INACTIVE' }, 'c'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids an ADMIN promoting a user to OWNER (scope check throws)', async () => {
      queryUsers.findFirst.mockResolvedValue(baseUser());
      permissions.assertCallerCanAssign.mockRejectedValue(
        new Error('Forbidden'),
      );
      await expect(
        service.update('id', { roleId: 'r-owner' }, 'c'),
      ).rejects.toThrow('Forbidden');
    });

    it('maps the email constraint to the email conflict message', async () => {
      queryUsers.findFirst
        .mockResolvedValueOnce(baseUser())
        .mockResolvedValueOnce(undefined);
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue({
            code: '23505',
            constraint: 'users_email_unique',
          }),
        }),
      });

      await expect(
        service.update('id', { email: 'duplicate@delivery.local' }, 'c'),
      ).rejects.toThrow(
        "User with email 'duplicate@delivery.local' already exists",
      );
    });

    it('maps the shop constraint to the shop login conflict message', async () => {
      queryUsers.findFirst
        .mockResolvedValueOnce(baseUser())
        .mockResolvedValueOnce(undefined);
      queryRoles.findFirst.mockResolvedValue({ id: 'r-shop', name: 'SHOP' });
      queryShops.findFirst.mockResolvedValue({
        id: 'shop-id',
        name: 'Central Shop',
      });
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue({
            cause: { code: '23505', constraint: 'users_shop_unique' },
          }),
        }),
      });

      await expect(
        service.update(
          'id',
          { roleId: 'r-shop', shopId: 'shop-id' },
          'caller-role-id',
        ),
      ).rejects.toThrow("Shop 'Central Shop' already has a login user");
    });

    it('pre-checks whether another user already has the requested shop', async () => {
      queryUsers.findFirst
        .mockResolvedValueOnce(baseUser())
        .mockResolvedValueOnce({ id: 'existing-login' });
      queryRoles.findFirst.mockResolvedValue({ id: 'r-shop', name: 'SHOP' });
      queryShops.findFirst.mockResolvedValue({
        id: 'shop-id',
        name: 'Central Shop',
      });

      await expect(
        service.update(
          'id',
          { roleId: 'r-shop', shopId: 'shop-id' },
          'caller-role-id',
        ),
      ).rejects.toThrow("Shop 'Central Shop' already has a login user");
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('forbids deleting an OWNER account', async () => {
      queryUsers.findFirst.mockResolvedValue(
        baseUser({ role: { name: 'OWNER' } }),
      );
      await expect(service.remove('id')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('deletes a non-owner account', async () => {
      queryUsers.findFirst.mockResolvedValue(baseUser());
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      await expect(service.remove('id')).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
