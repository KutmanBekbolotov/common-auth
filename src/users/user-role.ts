import { UserRole } from '@prisma/client';

export const GENERAL_DEPARTMENT_PUBLIC_ROLE = 'General-department' as const;

export type ClientUserRole =
  | 'admin'
  | 'super_admin'
  | 'manager'
  | 'operator'
  | 'auditor'
  | 'ceo'
  | 'license'
  | 'general_department'
  | 'spec'
  | 'hr'
  | 'ovk'
  | 'pressa'
  | 'TV'
  | 'Practice'
  | 'other';

export type PublicUserRole =
  | Exclude<UserRole, typeof UserRole.GeneralDepartment>
  | typeof GENERAL_DEPARTMENT_PUBLIC_ROLE;

export const PUBLIC_USER_ROLES: PublicUserRole[] = Object.values(UserRole)
  .filter((role) => role !== UserRole.citizen)
  .map((role) => toPublicUserRole(role));

export const CLIENT_USER_ROLES: ClientUserRole[] = [
  'admin',
  'super_admin',
  'manager',
  'operator',
  'auditor',
  'ceo',
  'license',
  'general_department',
  'spec',
  'hr',
  'ovk',
  'pressa',
  'TV',
  'Practice',
  'other',
];

export const ACCEPTED_USER_ROLE_VALUES = [
  ...PUBLIC_USER_ROLES,
  ...CLIENT_USER_ROLES.filter((role) => role !== 'other'),
] as const;

const CLIENT_ROLE_BY_PRISMA_ROLE: Record<UserRole, ClientUserRole> = {
  [UserRole.admin]: 'admin',
  [UserRole.ceo]: 'ceo',
  [UserRole.license]: 'license',
  [UserRole.spec]: 'spec',
  [UserRole.hr]: 'hr',
  [UserRole.ovk]: 'ovk',
  [UserRole.TV]: 'TV',
  [UserRole.Practice]: 'Practice',
  [UserRole.Terminal]: 'other',
  [UserRole.SuperAdmin]: 'super_admin',
  [UserRole.INVENTORY_IT]: 'other',
  [UserRole.INVENTORY_AHO]: 'other',
  [UserRole.INVENTORY_ACCOUNTANT]: 'other',
  [UserRole.INVENTORY_AUDITOR]: 'other',
  [UserRole.Manager]: 'manager',
  [UserRole.Auditor]: 'auditor',
  [UserRole.Operator]: 'operator',
  [UserRole.System]: 'other',
  [UserRole.PRESSA]: 'pressa',
  [UserRole.GeneralDepartment]: 'general_department',
  [UserRole.Citizen]: 'other',
  [UserRole.citizen]: 'other',
};

const PRISMA_ROLE_BY_CLIENT_ROLE: Partial<Record<ClientUserRole, UserRole>> = {
  admin: UserRole.admin,
  super_admin: UserRole.SuperAdmin,
  manager: UserRole.Manager,
  operator: UserRole.Operator,
  auditor: UserRole.Auditor,
  ceo: UserRole.ceo,
  license: UserRole.license,
  general_department: UserRole.GeneralDepartment,
  spec: UserRole.spec,
  hr: UserRole.hr,
  ovk: UserRole.ovk,
  pressa: UserRole.PRESSA,
  TV: UserRole.TV,
  Practice: UserRole.Practice,
};

export function toPublicUserRole(role: UserRole): PublicUserRole {
  if (role === UserRole.GeneralDepartment) {
    return GENERAL_DEPARTMENT_PUBLIC_ROLE;
  }

  return role as PublicUserRole;
}

export function toClientUserRole(role: UserRole): ClientUserRole {
  return CLIENT_ROLE_BY_PRISMA_ROLE[role];
}

export function toPrismaUserRole(value: unknown): unknown {
  if (typeof value === 'string' && value in PRISMA_ROLE_BY_CLIENT_ROLE) {
    return PRISMA_ROLE_BY_CLIENT_ROLE[value as ClientUserRole];
  }

  if (value === GENERAL_DEPARTMENT_PUBLIC_ROLE) {
    return UserRole.GeneralDepartment;
  }

  return value;
}
