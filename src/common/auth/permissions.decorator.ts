import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from './auth.constants.js';
import type { PermissionKey } from './permission-keys.js';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
