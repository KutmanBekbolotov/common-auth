import { UserRole } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';

const expectObjectContaining = (value: Record<string, unknown>) =>
  expect.objectContaining(value) as unknown;

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

  it('allows creating Practice users without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.create.mockResolvedValue({
      id: 'user-id',
      email: 'practice@example.com',
      role: UserRole.Practice,
      username: 'Practice User',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createUser({
      email: 'practice@example.com',
      password: 'strong-password',
      role: UserRole.Practice,
    });

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        role: UserRole.Practice,
        orgId: null,
        departmentId: null,
      }),
    });
  });

  it('allows creating practice_manager users without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.create.mockResolvedValue({
      id: 'user-id',
      email: 'practice-manager@example.com',
      role: UserRole.practice_manager,
      username: 'Practice Manager',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createUser({
      email: 'practice-manager@example.com',
      password: 'strong-password',
      role: UserRole.practice_manager,
    });

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        role: UserRole.practice_manager,
        orgId: null,
        departmentId: null,
      }),
    });
  });

  it('allows creating General-department users without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.create.mockResolvedValue({
      id: 'user-id',
      email: 'general@example.com',
      role: UserRole.GeneralDepartment,
      username: 'General User',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createUser({
      email: 'general@example.com',
      password: 'strong-password',
      role: UserRole.GeneralDepartment,
    });

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        role: UserRole.GeneralDepartment,
        orgId: null,
        departmentId: null,
      }),
    });
  });

  it('requires orgId and departmentId when creating spec users', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );

    await expect(
      service.createUser({
        email: 'spec@example.com',
        password: 'strong-password',
        role: UserRole.spec,
      }),
    ).rejects.toThrow('spec users require orgId and departmentId');
    expect(prismaService.user.create).not.toHaveBeenCalled();
  });

  it('allows creating inventory users without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.create.mockResolvedValue({
      id: 'user-id',
      email: 'inventory-it@example.com',
      role: UserRole.INVENTORY_IT,
      username: 'Inventory IT',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createUser({
      email: 'inventory-it@example.com',
      password: 'strong-password',
      role: UserRole.INVENTORY_IT,
    });

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: expectObjectContaining({
        role: UserRole.INVENTORY_IT,
        orgId: null,
        departmentId: null,
      }),
    });
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

  it('allows updating role to Practice without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.hr,
      username: 'User',
      orgId: null,
      departmentId: null,
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
      role: UserRole.Practice,
      username: 'User',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.updateUserRole('user-id', UserRole.Practice, 'admin-id');

    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { role: UserRole.Practice },
    });
  });

  it('allows updating role to practice_manager without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.hr,
      username: 'User',
      orgId: null,
      departmentId: null,
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
      role: UserRole.practice_manager,
      username: 'User',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.updateUserRole(
      'user-id',
      UserRole.practice_manager,
      'admin-id',
    );

    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { role: UserRole.practice_manager },
    });
  });

  it('allows updating role to inventory auditor without orgId and departmentId', async () => {
    adminUserScopeOptionsService.assertScopeOptionExists.mockResolvedValue(
      undefined,
    );
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.hr,
      username: 'User',
      orgId: null,
      departmentId: null,
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
      role: UserRole.INVENTORY_AUDITOR,
      username: 'User',
      orgId: null,
      departmentId: null,
      photoUrl: null,
      legacyFirebaseUid: null,
      disabled: false,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.updateUserRole(
      'user-id',
      UserRole.INVENTORY_AUDITOR,
      'admin-id',
    );

    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { role: UserRole.INVENTORY_AUDITOR },
    });
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
