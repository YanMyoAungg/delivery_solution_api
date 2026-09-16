import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';
import { PERMISSIONS_KEY } from './auth.constants.js';
import type { AuthenticatedUser } from './auth.constants.js';
import type { PermissionService } from '../../permissions/permissions.service.js';

function makeContext(user: AuthenticatedUser | undefined) {
  return {
    getHandler: () => ({}) as never,
    getClass: () => class UsersController {} as never,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: vi.fn() };
  const queryRoles = { findFirst: vi.fn() };
  const permissionService = {
    getEffectivePermissions: vi.fn(),
  } as unknown as PermissionService;

  function createGuard() {
    return new PermissionsGuard(reflector as never, permissionService as never);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: role row resolves; effective permissions from the service.
    queryRoles.findFirst.mockResolvedValue({ name: 'ADMIN' });
    permissionService.getEffectivePermissions = vi
      .fn()
      .mockResolvedValue(['users.read']);
  });

  it('passes routes without permission metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      createGuard().canActivate(makeContext(undefined)),
    ).resolves.toBe(true);
  });

  it('passes an admin for an admin-scoped permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read']);

    const result = await createGuard().canActivate(
      makeContext({
        id: 'u1',
        name: 'Admin',
        email: 'a@x.local',
        role: 'ADMIN',
        roleId: 'r-admin',
      }),
    );

    expect(result).toBe(true);
  });

  it('rejects an authenticated user lacking the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read']);
    queryRoles.findFirst.mockResolvedValue({ name: 'RIDER' });
    permissionService.getEffectivePermissions = vi.fn().mockResolvedValue([]);

    await expect(
      createGuard().canActivate(
        makeContext({
          id: 'u1',
          name: 'Rider',
          email: 'r@x.local',
          role: 'RIDER',
          roleId: 'r-rider',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unauthenticated request on a permission-protected route', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read']);

    await expect(
      createGuard().canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unknown permissions (fail closed)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['orders.manage']);

    await expect(
      createGuard().canActivate(
        makeContext({
          id: 'u1',
          name: 'Owner',
          email: 'o@x.local',
          role: 'OWNER',
          roleId: 'r-owner',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records permission metadata key usage', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read']);

    await createGuard().canActivate(
      makeContext({
        id: 'u1',
        name: 'Owner',
        email: 'o@x.local',
        role: 'OWNER',
        roleId: 'r-owner',
      }),
    );

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });
});
