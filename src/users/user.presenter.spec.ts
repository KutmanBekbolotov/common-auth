import { UserRole } from '@prisma/client';
import { toAuthContextResponse, toAuthPermissions } from './user.presenter';

describe('user presenter permissions', () => {
  it('grants cloud access to SuperAdmin and System', () => {
    expect(toAuthPermissions(UserRole.SuperAdmin)).toEqual({
      cloud: true,
      practiceExamDistribution: false,
    });
    expect(toAuthPermissions(UserRole.System)).toEqual({
      cloud: true,
      practiceExamDistribution: false,
    });
  });

  it('keeps cloud access disabled for non-privileged roles', () => {
    expect(toAuthPermissions(UserRole.Manager)).toEqual({
      cloud: false,
      practiceExamDistribution: false,
    });
    expect(toAuthPermissions(UserRole.PRESSA)).toEqual({
      cloud: false,
      practiceExamDistribution: false,
    });
    expect(toAuthPermissions(UserRole.GeneralDepartment)).toEqual({
      cloud: false,
      practiceExamDistribution: false,
    });
    expect(toAuthPermissions(UserRole.Citizen)).toEqual({
      cloud: false,
      practiceExamDistribution: false,
    });
    expect(toAuthPermissions(UserRole.citizen)).toEqual({
      cloud: false,
      practiceExamDistribution: false,
    });
  });

  it('grants only practice exam distribution access to practice_manager', () => {
    const response = toAuthContextResponse({
      id: 'user-id',
      email: 'practice-manager@example.com',
      passwordHash: 'hash',
      refreshTokenHash: null,
      sessionId: null,
      role: UserRole.practice_manager,
      username: 'Practice Manager',
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

    expect(response.userRole).toBe('practice_manager');
    expect(response.authRole).toBe('practice_manager');
    expect(response.role).toBe('practice_manager');
    expect(response.roles).toEqual(['practice_manager']);
    expect(response.permissions).toEqual({
      cloud: false,
      practiceExamDistribution: true,
    });
    expect(response.scope.permissions).toEqual(response.permissions);
  });

  it('maps GeneralDepartment to the public General-department role', () => {
    const response = toAuthContextResponse({
      id: 'user-id',
      email: 'general@example.com',
      passwordHash: 'hash',
      refreshTokenHash: null,
      sessionId: null,
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
    expect(response.authRole).toBe('General-department');
    expect(response.role).toBe('general_department');
    expect(response.roles).toEqual(['general_department']);
    expect(response.user.role).toBe('general_department');
    expect(response.user.authRole).toBe('General-department');
    expect(response.scope.role).toBe('general_department');
    expect(response.scope.authRole).toBe('General-department');
  });

  it('keeps inventory roles unchanged in auth context', () => {
    const response = toAuthContextResponse({
      id: 'user-id',
      email: 'inventory-it@example.com',
      passwordHash: 'hash',
      refreshTokenHash: null,
      sessionId: null,
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
    expect(response.authRole).toBe('INVENTORY_IT');
    expect(response.role).toBe('other');
    expect(response.userProfile.role).toBe('other');
    expect(response.userProfile.authRole).toBe('INVENTORY_IT');
    expect(response.scope.role).toBe('other');
    expect(response.scope.authRole).toBe('INVENTORY_IT');
  });
});
