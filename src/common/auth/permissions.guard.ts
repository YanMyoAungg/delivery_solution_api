import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, type AuthenticatedUser } from './auth.constants.js';
import { PermissionService } from '../../permissions/permissions.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    const effective = await this.permissions.getEffectivePermissions(
      user.roleId,
    );
    const allowed = required.every((permission) =>
      effective.includes(permission),
    );

    if (!allowed) {
      throw new ForbiddenException(
        'You do not have the required permissions for this action',
      );
    }

    return true;
  }
}
