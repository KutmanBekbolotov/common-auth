import { Prisma, ScopeOptionType, UserRole } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { CLIENT_USER_ROLES, PUBLIC_USER_ROLES } from '../users/user-role';
import { AdminUserScopeOptionsService } from './admin-user-scope-options.service';

const expectArrayContaining = (value: unknown[]) =>
  expect.arrayContaining(value) as unknown;

type ScopeOptionRecord = {
  id: string;
  type: ScopeOptionType;
  value: string;
};

type TransactionClientMock = {
  scopeOption: {
    findUnique: () => Promise<ScopeOptionRecord | null>;
    update: () => Promise<ScopeOptionRecord>;
  };
  user: {
    updateMany: () => Promise<{ count: number }>;
  };
};

describe('AdminUserScopeOptionsService', () => {
  let service: AdminUserScopeOptionsService;
  let transactionClient: TransactionClientMock | null;
  let prismaService: {
    $transaction: <T>(
      callback: (tx: TransactionClientMock) => Promise<T>,
    ) => Promise<T>;
    scopeOption: {
      count: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: {
      count: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    transactionClient = null;
    prismaService = {
      $transaction: <T>(
        callback: (tx: TransactionClientMock) => Promise<T>,
      ) => {
        if (!transactionClient) {
          throw new Error('Transaction client not configured');
        }

        return callback(transactionClient);
      },
      scopeOption: {
        count: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    service = new AdminUserScopeOptionsService(prismaService as never);
  });

  it('returns grouped scope options for selects', async () => {
    prismaService.scopeOption.count.mockResolvedValue(2);
    prismaService.scopeOption.findMany.mockResolvedValue([
      { id: '1', type: ScopeOptionType.orgId, value: 'Bishkek' },
      { id: '2', type: ScopeOptionType.departmentId, value: 'Osh-City' },
    ]);

    await expect(service.listScopeOptions()).resolves.toEqual({
      items: [
        { id: '1', type: ScopeOptionType.orgId, value: 'Bishkek' },
        { id: '2', type: ScopeOptionType.departmentId, value: 'Osh-City' },
      ],
      roles: expectArrayContaining([
        ...PUBLIC_USER_ROLES,
        UserRole.INVENTORY_IT,
        UserRole.INVENTORY_AHO,
        UserRole.INVENTORY_ACCOUNTANT,
        UserRole.INVENTORY_AUDITOR,
      ]),
      frontendRoles: CLIENT_USER_ROLES,
      orgIds: ['Bishkek'],
      departmentIds: ['Osh-City'],
    });
  });

  it('renames a scope option and updates assigned users', async () => {
    prismaService.scopeOption.count.mockResolvedValue(1);
    transactionClient = {
      scopeOption: {
        findUnique: () =>
          Promise.resolve({
            id: '1',
            type: ScopeOptionType.orgId,
            value: 'Bishkek',
          }),
        update: () =>
          Promise.resolve({
            id: '1',
            type: ScopeOptionType.orgId,
            value: 'Bishkek City',
          }),
      },
      user: {
        updateMany: () => Promise.resolve({ count: 3 }),
      },
    };

    await expect(
      service.updateScopeOption('1', 'Bishkek City'),
    ).resolves.toEqual({
      item: {
        id: '1',
        type: ScopeOptionType.orgId,
        value: 'Bishkek City',
      },
    });
  });

  it('rejects deleting a scope option used by users', async () => {
    prismaService.scopeOption.count.mockResolvedValue(1);
    prismaService.scopeOption.findUnique.mockResolvedValue({
      id: '1',
      type: ScopeOptionType.departmentId,
      value: 'Osh-City',
    });
    prismaService.user.count.mockResolvedValue(1);

    await expect(service.deleteScopeOption('1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns helpful validation error for unknown scope value', async () => {
    prismaService.scopeOption.count.mockResolvedValue(1);
    prismaService.scopeOption.findUnique.mockResolvedValue(null);
    prismaService.scopeOption.findMany.mockResolvedValue([
      { value: 'Bishkek' },
      { value: 'Chuy' },
    ]);

    await expect(
      service.assertScopeOptionExists('orgId', 'Unknown'),
    ).rejects.toThrow('orgId must be one of: Bishkek, Chuy');
  });

  it('maps unique conflicts to conflict exceptions', async () => {
    prismaService.scopeOption.count.mockResolvedValue(1);
    prismaService.scopeOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.createScopeOption(ScopeOptionType.orgId, 'Bishkek'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
