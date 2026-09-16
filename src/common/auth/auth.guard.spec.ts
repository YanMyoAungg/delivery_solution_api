import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard.js';

function makeContext(request: Record<string, unknown>) {
  return {
    getHandler: () => ({}) as never,
    getClass: () => class RouteController {} as never,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const reflector = { getAllAndOverride: vi.fn() };
  const jwt = { verifyAsync: vi.fn() };
  const config = { get: vi.fn() };
  const queryUsers = { findFirst: vi.fn() };
  const database = { db: { query: { users: queryUsers } } };

  function createGuard() {
    return new JwtAuthGuard(
      reflector as never,
      jwt as never,
      config as never,
      database as never,
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    config.get.mockReturnValue('test-secret');
  });

  it('lets public routes through without authentication', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    const result = await createGuard().canActivate(
      makeContext({ headers: {} }),
    );

    expect(result).toBe(true);
  });

  it('rejects a missing Authorization header', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      createGuard().canActivate(makeContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-bearer Authorization header', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      createGuard().canActivate(
        makeContext({ headers: { authorization: 'Basic abc' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid or expired token', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      createGuard().canActivate(
        makeContext({ headers: { authorization: 'Bearer bad.token.here' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token issued before the password was changed', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({
      sub: '33333333-3333-4333-8333-333333333333',
      email: 'owner@mail.com',
      role: 'OWNER',
      iat: 1000, // token issued long ago
    });
    queryUsers.findFirst.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Owner',
      email: 'owner@mail.com',
      role: 'OWNER',
      status: 'ACTIVE',
      passwordChangedAt: new Date('2026-01-02T00:00:00.000Z'), // changed after iat
    });

    await expect(
      createGuard().canActivate(
        makeContext({ headers: { authorization: 'Bearer valid.token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token issued after the password was changed', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({
      sub: '33333333-3333-4333-8333-333333333333',
      email: 'owner@mail.com',
      role: 'OWNER',
      iat: 2000000000, // 2033 — issued after the 2026 password change
    });
    queryUsers.findFirst.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Owner',
      email: 'owner@delivery.local',
      role: 'OWNER',
      status: 'ACTIVE',
      passwordChangedAt: new Date('2026-01-01T00:00:00.000Z'), // before iat
    });

    const result = await createGuard().canActivate(
      makeContext({ headers: { authorization: 'Bearer valid.token' } }),
    );

    expect(result).toBe(true);
  });

  it('rejects a valid token for a missing or deactivated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'owner@delivery.local',
      role: 'OWNER',
    });
    queryUsers.findFirst.mockResolvedValue(undefined);

    await expect(
      createGuard().canActivate(
        makeContext({ headers: { authorization: 'Bearer valid.token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves the active user and attaches it to the request', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({
      sub: '33333333-3333-4333-8333-333333333333',
      email: 'owner@delivery.local',
      role: 'OWNER',
    });
    queryUsers.findFirst.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Owner',
      email: 'owner@delivery.local',
      roleId: 'r-owner',
      role: { name: 'OWNER' },
      status: 'ACTIVE',
    });

    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: 'Bearer valid.token' },
    };

    const result = await createGuard().canActivate(makeContext(request));

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Owner',
      email: 'owner@delivery.local',
      roleId: 'r-owner',
      role: 'OWNER',
    });
  });
});
