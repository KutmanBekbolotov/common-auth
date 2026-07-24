import { User, UserRole } from '@prisma/client';
import {
  CLOUD_ACCESS_ROLES,
  PRACTICE_EXAM_DISTRIBUTION_ROLES,
} from '../auth/auth.constants';
import {
  ClientUserRole,
  PublicUserRole,
  toClientUserRole,
  toPublicUserRole,
} from './user-role';

export type SafeUser = Omit<
  User,
  'passwordHash' | 'refreshTokenHash' | 'sessionId' | 'pin' | 'role'
> & {
  role: ClientUserRole;
  roles: ClientUserRole[];
  authRole: PublicUserRole;
};

export type AuthResponseUser = SafeUser & {
  ProfilePic: string;
  permissions: AuthPermissions;
  scope: UserScope;
};

export type AuthContextResponse = {
  id: string;
  email: string;
  username: string | null;
  role: ClientUserRole;
  roles: ClientUserRole[];
  authRole: PublicUserRole;
  disabled: boolean;
  currentUser: {
    id: string;
    uid: string;
    email: string;
  };
  user: AuthResponseUser;
  userProfile: AuthResponseUser;
  userRole: PublicUserRole;
  orgId: string | null;
  departmentId: string | null;
  position: string | null;
  scope: UserScope;
  permissions: AuthPermissions;
};

export type UserScope = {
  role: ClientUserRole;
  roles: ClientUserRole[];
  authRole: PublicUserRole;
  orgId: string | null;
  departmentId: string | null;
  position: string | null;
  permissions: AuthPermissions;
};

export type AuthPermissions = {
  cloud: boolean;
  practiceExamDistribution: boolean;
};

export function toSafeUser(user: User): SafeUser {
  const { passwordHash, refreshTokenHash, sessionId, pin, role, ...safeUser } =
    user;
  void passwordHash;
  void refreshTokenHash;
  void sessionId;
  void pin;
  const clientRole = toClientUserRole(role);

  return {
    ...safeUser,
    role: clientRole,
    roles: [clientRole],
    authRole: toPublicUserRole(role),
  };
}

export function toAuthResponseUser(user: User): AuthResponseUser {
  const safeUser = toSafeUser(user);
  const permissions = toAuthPermissions(user.role);

  return {
    ...safeUser,
    ProfilePic: safeUser.photoUrl ?? '',
    permissions,
    scope: toUserScope(user, permissions),
  };
}

export function toAuthContextResponse(user: User): AuthContextResponse {
  const responseUser = toAuthResponseUser(user);
  const permissions = responseUser.scope.permissions;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: responseUser.role,
    roles: responseUser.roles,
    authRole: responseUser.authRole,
    disabled: user.disabled,
    currentUser: {
      id: user.id,
      uid: user.id,
      email: user.email,
    },
    user: responseUser,
    userProfile: responseUser,
    userRole: toPublicUserRole(user.role),
    orgId: user.orgId,
    departmentId: user.departmentId,
    position: user.position,
    scope: responseUser.scope,
    permissions,
  };
}

export function toUserScope(
  user: Pick<User, 'role' | 'orgId' | 'departmentId' | 'position'>,
  permissions = toAuthPermissions(user.role),
): UserScope {
  const clientRole = toClientUserRole(user.role);

  return {
    role: clientRole,
    roles: [clientRole],
    authRole: toPublicUserRole(user.role),
    orgId: user.orgId,
    departmentId: user.departmentId,
    position: user.position,
    permissions,
  };
}

export function toAuthPermissions(role: UserRole): AuthPermissions {
  return {
    cloud: CLOUD_ACCESS_ROLES.includes(role),
    practiceExamDistribution:
      PRACTICE_EXAM_DISTRIBUTION_ROLES.includes(role),
  };
}
