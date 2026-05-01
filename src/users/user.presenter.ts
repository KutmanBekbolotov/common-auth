import { User, UserRole } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash' | 'refreshTokenHash'>;

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
  userRole: UserRole;
  orgId: string | null;
  departmentId: string | null;
  scope: UserScope;
  permissions: AuthPermissions;
};

export type UserScope = {
  role: UserRole;
  orgId: string | null;
  departmentId: string | null;
  permissions: AuthPermissions;
};

export type AuthPermissions = {
  cloud: boolean;
};

export function toSafeUser(user: User): SafeUser {
  const safeUser = { ...user };
  delete (safeUser as Partial<User>).passwordHash;
  delete (safeUser as Partial<User>).refreshTokenHash;

  return safeUser;
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
    userRole: user.role,
    orgId: user.orgId,
    departmentId: user.departmentId,
    scope: responseUser.scope,
    permissions,
  };
}

export function toUserScope(
  user: Pick<User, 'role' | 'orgId' | 'departmentId'>,
  permissions = toAuthPermissions(user.role),
): UserScope {
  return {
    role: user.role,
    orgId: user.orgId,
    departmentId: user.departmentId,
    permissions,
  };
}

export function toAuthPermissions(role: UserRole): AuthPermissions {
  return {
    cloud: role === UserRole.admin || role === UserRole.ovk,
  };
}
