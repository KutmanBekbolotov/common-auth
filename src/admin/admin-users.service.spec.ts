import { UserRole } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let prismaService: {
    user: {
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let configService: {
    get: jest.Mock;
  };
  let adminUserScopeOptionsService: {
    assertScopeOptionExists: jest.Mock;
  };

  beforeEach(() => {
    prismaService = {
      user: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    configService = {
      get: jest.fn(),
    };
    adminUserScopeOptionsService = {
      assertScopeOptionExists: jest.fn(),
    };

    service = new AdminUsersService(
      prismaService as never,
      configService as never,
      adminUserScopeOptionsService as never,
    );
  });

  it('delegates scope validation during user creation', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.create.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.spec,
      username: 'User',
      orgId: 'Bishkek',
      departmentId: 'Osh-City',
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createUser({
      email: 'user@example.com',
      password: 'strong-password',
      role: UserRole.spec,
      orgId: 'Bishkek',
      departmentId: 'Osh-City',
    });

    expect(
      adminUserScopeOptionsService.assertScopeOptionExists,
    ).toHaveBeenNthCalledWith(1, 'orgId', 'Bishkek');
    expect(
      adminUserScopeOptionsService.assertScopeOptionExists,
    ).toHaveBeenNthCalledWith(2, 'departmentId', 'Osh-City');
  });

  it('delegates scope validation during user updates', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.spec,
      username: 'User',
      orgId: 'Bishkek',
      departmentId: 'Osh-City',
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaService.user.update.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.spec,
      username: 'User',
      orgId: 'Bishkek',
      departmentId: 'Kemin',
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.updateUser(
      'user-id',
      {
        departmentId: 'Kemin',
      },
      'admin-id',
    );

    expect(
      adminUserScopeOptionsService.assertScopeOptionExists,
    ).toHaveBeenNthCalledWith(1, 'orgId', 'Bishkek');
    expect(
      adminUserScopeOptionsService.assertScopeOptionExists,
    ).toHaveBeenNthCalledWith(2, 'departmentId', 'Kemin');
  });

  it('delegates scope validation during role updates', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.hr,
      username: 'User',
      orgId: 'Bishkek',
      departmentId: 'Osh-City',
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaService.user.update.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.spec,
      username: 'User',
      orgId: 'Bishkek',
      departmentId: 'Osh-City',
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.updateUserRole('user-id', UserRole.spec, 'admin-id');

    expect(
      adminUserScopeOptionsService.assertScopeOptionExists,
    ).toHaveBeenNthCalledWith(1, 'orgId', 'Bishkek');
    expect(
      adminUserScopeOptionsService.assertScopeOptionExists,
    ).toHaveBeenNthCalledWith(2, 'departmentId', 'Osh-City');
  });

  it('prevents administrative users from changing their own role', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'admin@example.com',
      role: UserRole.SuperAdmin,
      username: 'Admin',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.updateUserRole('user-id', UserRole.Manager, 'user-id'),
    ).rejects.toThrow('Administrative user cannot change own role');
  });
});
