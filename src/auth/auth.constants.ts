import { UserRole } from '@prisma/client';

export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const LEGACY_REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const AUTH_COOKIE_PATH = '/auth';
export const DEFAULT_ACCESS_TOKEN_TTL = '15m';
export const DEFAULT_REFRESH_TOKEN_TTL = '30d';

export const ADMIN_USER_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.SuperAdmin,
];
export const CLOUD_ACCESS_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.ovk,
  UserRole.SuperAdmin,
  UserRole.System,
];
export const PRACTICE_EXAM_DISTRIBUTION_ROLES: UserRole[] = [
  UserRole.practice_manager,
];
