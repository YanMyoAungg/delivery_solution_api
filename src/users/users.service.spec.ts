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
  const db = {
    query: { users: queryUsers },
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
