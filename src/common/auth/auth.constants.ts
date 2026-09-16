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
  /** Set automatically by jsonwebtoken on sign. Used to detect pre-rotation tokens. */
  iat?: number;
}
