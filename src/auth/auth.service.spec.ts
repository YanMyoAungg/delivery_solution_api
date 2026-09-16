import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hashPassword } from '../common/utils/password.util.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from '../common/database/database.service.js';
import { PermissionService } from '../permissions/permissions.service.js';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Owner',
    email: 'owner@mail.com',
    phone: null,
    roleId: 'r-owner',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    findByEmailWithPassword: vi.fn(),
    findByIdWithPassword: vi.fn(),
    setPassword: vi.fn(),
    getById: vi.fn(),
  };
  const jwt = { signAsync: vi.fn() };
  const config = { get: vi.fn() };
  const queryRoles = { findFirst: vi.fn() };
  const database = { db: { query: { roles: queryRoles } } };
  const permissionService = { getEffectivePermissions: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    config.get.mockImplementation((key: string) =>
      key === 'JWT_SECRET' ? 'test-secret' : undefined,
    );
    queryRoles.findFirst.mockResolvedValue({ name: 'OWNER' });
    permissionService.getEffectivePermissions.mockResolvedValue([
      'users.create',
      'users.read',
      'users.update',
      'permissions.read',
    ]);
    usersService.getById.mockResolvedValue({
      ...baseUser(),
      role: 'OWNER',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: DatabaseService, useValue: database },
        { provide: PermissionService, useValue: permissionService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('issues an access token that excludes the password hash', async () => {
      const passwordHash = await hashPassword('owner1234');
      usersService.findByEmailWithPassword.mockResolvedValue(
        baseUser({ passwordHash }),
      );
      jwt.signAsync.mockResolvedValue('signed-token');

      const result = await service.login({
        email: 'owner@mail.com',
        password: 'owner1234',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(result.user.email).toBe('owner@mail.com');
      expect(result.user.role).toBe('OWNER');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.permissions).toBeInstanceOf(Array);
      expect(result.permissions.length).toBeGreaterThan(0);
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: '11111111-1111-4111-8111-111111111111',
        }),
        expect.objectContaining({ expiresIn: '1h' }),
      );
    });

    it('rejects an unknown email', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@delivery.local', password: 'whatever1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await hashPassword('owner1234');
      usersService.findByEmailWithPassword.mockResolvedValue(
        baseUser({ passwordHash }),
      );

      await expect(
        service.login({ email: 'owner@mail.com', password: 'wrongpass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated account even with valid credentials', async () => {
      const passwordHash = await hashPassword('owner1234');
      usersService.findByEmailWithPassword.mockResolvedValue(
        baseUser({ passwordHash, status: 'INACTIVE' }),
      );

      await expect(
        service.login({ email: 'owner@mail.com', password: 'owner1234' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('throws when the current password is wrong', async () => {
      const passwordHash = await hashPassword('owner1234');
      usersService.findByIdWithPassword.mockResolvedValue({ passwordHash });

      await expect(
        service.changePassword('11111111-1111-4111-8111-111111111111', {
          currentPassword: 'nope',
          newPassword: 'newpassword1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.setPassword).not.toHaveBeenCalled();
    });

    it('hashes and persists a new password', async () => {
      const passwordHash = await hashPassword('owner1234');
      usersService.findByIdWithPassword.mockResolvedValue({ passwordHash });

      await service.changePassword('11111111-1111-4111-8111-111111111111', {
        currentPassword: 'owner1234',
        newPassword: 'newpassword1',
      });

      const [userId, storedHash] = usersService.setPassword.mock.calls[0];
      expect(userId).toBe('11111111-1111-4111-8111-111111111111');
      expect(storedHash.startsWith('$2')).toBe(true);
    });

    it('throws when the account no longer exists', async () => {
      usersService.findByIdWithPassword.mockResolvedValue(null);

      await expect(
        service.changePassword('does-not-exist', {
          currentPassword: 'owner1234',
          newPassword: 'newpassword1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
