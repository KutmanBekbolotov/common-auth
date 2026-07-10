import { User, UserRole } from '@prisma/client';
import { CLOUD_ACCESS_ROLES } from '../auth/auth.constants';
import { PublicUserRole, toPublicUserRole } from './user-role';

export type SafeUser = Omit<
  User,
  'passwordHash' | 'refreshTokenHash' | 'pin' | 'role'
> & {
  role: PublicUserRole;
};

export type AuthResponseUser = SafeUser & {
  ProfilePic: string;
  scope: UserScope;
};

export type AuthContextResponse = {
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
  role: PublicUserRole;
  orgId: string | null;
  departmentId: string | null;
  position: string | null;
  permissions: AuthPermissions;
};

export type AuthPermissions = {
  cloud: boolean;
};

export function toSafeUser(user: User): SafeUser {
  const { passwordHash, refreshTokenHash, pin, role, ...safeUser } = user;
  void passwordHash;
  void refreshTokenHash;
  void pin;

  return {
    ...safeUser,
    role: toPublicUserRole(role),
  };
}

export function toAuthResponseUser(user: User): AuthResponseUser {
  const safeUser = toSafeUser(user);
  const permissions = toAuthPermissions(user.role);

  return {
    ...safeUser,
    ProfilePic: safeUser.photoUrl ?? '',
    scope: toUserScope(user, permissions),
  };
}

export function toAuthContextResponse(user: User): AuthContextResponse {
  const responseUser = toAuthResponseUser(user);
  const permissions = responseUser.scope.permissions;

  return {
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
  return {
    role: toPublicUserRole(user.role),
    orgId: user.orgId,
    departmentId: user.departmentId,
    position: user.position,
    permissions,
  };
}

export function toAuthPermissions(role: UserRole): AuthPermissions {
  return {
    cloud: CLOUD_ACCESS_ROLES.includes(role),
  };
}
