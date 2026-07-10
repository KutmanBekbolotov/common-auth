import { UserRole } from '@prisma/client';
import { toAuthContextResponse, toAuthPermissions } from './user.presenter';

describe('user presenter permissions', () => {
  it('grants cloud access to SuperAdmin and System', () => {
    expect(toAuthPermissions(UserRole.SuperAdmin)).toEqual({ cloud: true });
    expect(toAuthPermissions(UserRole.System)).toEqual({ cloud: true });
  });

  it('keeps cloud access disabled for non-privileged roles', () => {
    expect(toAuthPermissions(UserRole.Manager)).toEqual({ cloud: false });
    expect(toAuthPermissions(UserRole.PRESSA)).toEqual({ cloud: false });
    expect(toAuthPermissions(UserRole.GeneralDepartment)).toEqual({
      cloud: false,
    });
    expect(toAuthPermissions(UserRole.Citizen)).toEqual({ cloud: false });
    expect(toAuthPermissions(UserRole.citizen)).toEqual({ cloud: false });
  });

  it('maps GeneralDepartment to the public General-department role', () => {
    const response = toAuthContextResponse({
      id: 'user-id',
      email: 'general@example.com',
      passwordHash: 'hash',
      refreshTokenHash: null,
      role: UserRole.GeneralDepartment,
      username: 'General User',
      phone: null,
      pin: null,
      orgId: null,
      departmentId: null,
      position: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(response.userRole).toBe('General-department');
    expect(response.user.role).toBe('General-department');
    expect(response.scope.role).toBe('General-department');
  });

  it('keeps inventory roles unchanged in auth context', () => {
    const response = toAuthContextResponse({
      id: 'user-id',
      email: 'inventory-it@example.com',
      passwordHash: 'hash',
      refreshTokenHash: null,
      role: UserRole.INVENTORY_IT,
      username: 'Inventory IT',
      phone: null,
      pin: null,
      orgId: null,
      departmentId: null,
      position: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(response.userRole).toBe('INVENTORY_IT');
    expect(response.userProfile.role).toBe('INVENTORY_IT');
    expect(response.scope.role).toBe('INVENTORY_IT');
  });
});
