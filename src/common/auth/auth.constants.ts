export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  /** Role name resolved by the auth guard. Not used for RBAC decisions. */
  role: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  roleId: string;
  /**
   * Set automatically by jsonwebtoken on sign, in whole seconds. Too coarse to
   * order a token against `users.password_changed_at` (which keeps
   * milliseconds) — see `tokenIssuedAtMs`.
   */
  iat?: number;
  /**
   * Issue instant in milliseconds, set on sign. The auth guard compares it
   * against `password_changed_at` to revoke tokens minted before a password
   * rotation. Optional so tokens minted before this claim existed still
   * verify — those fall back to a second-granularity comparison.
   */
  tokenIssuedAtMs?: number;
}
