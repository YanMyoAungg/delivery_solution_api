/**
 * Registry of known permission keys. Keys may also be created at runtime via
 * the API (dynamic catalog), so the type admits any string; the const list
 * only gives autocomplete for the standard set.
 */
export const PERMISSION_KEYS = [
  'users.create',
  'users.list',
  'users.read',
  'users.update',
  'users.delete',
  'permissions.read',
  'permissions.create',
  'permissions.manage',
  'permissions.delete',
  'roles.create',
  'roles.list',
  'roles.read',
  'roles.update',
  'roles.delete',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number] | (string & {});
