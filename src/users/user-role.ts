import { UserRole } from '@prisma/client';

export const GENERAL_DEPARTMENT_PUBLIC_ROLE = 'General-department' as const;

export type PublicUserRole =
  | Exclude<UserRole, typeof UserRole.GeneralDepartment>
  | typeof GENERAL_DEPARTMENT_PUBLIC_ROLE;

export const PUBLIC_USER_ROLES: PublicUserRole[] = Object.values(UserRole)
  .filter((role) => role !== UserRole.citizen)
  .map((role) => toPublicUserRole(role));

export function toPublicUserRole(role: UserRole): PublicUserRole {
  if (role === UserRole.GeneralDepartment) {
    return GENERAL_DEPARTMENT_PUBLIC_ROLE;
  }

  return role as PublicUserRole;
}

export function toPrismaUserRole(value: unknown): unknown {
  if (value === GENERAL_DEPARTMENT_PUBLIC_ROLE) {
    return UserRole.GeneralDepartment;
  }

  return value;
}
