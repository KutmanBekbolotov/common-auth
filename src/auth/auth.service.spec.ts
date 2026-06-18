import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { Prisma, UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

const baseUser = {
  id: 'user-id',
  email: 'admin@example.com',
  passwordHash: 'password-hash',
  refreshTokenHash: null,
  role: UserRole.admin,
  username: 'Admin',
  phone: null,
  pin: null,
  orgId: null,
  departmentId: null,
  photoUrl: null,
  legacyFirebaseUid: null,
  disabled: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: {
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    prismaService = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'JWT_SECRET':
            return 'access-secret';
          case 'JWT_ACCESS_TTL':
            return '4h';
          case 'JWT_REFRESH_SECRET':
            return 'refresh-secret';
          case 'JWT_REFRESH_TTL':
            return '30d';
          case 'PASSWORD_SALT_ROUNDS':
            return '4';
          case 'NODE_ENV':
            return 'test';
          default:
            return undefined;
        }
      }),
    };

    service = new AuthService(
      prismaService as never,
      jwtService as never,
      configService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an auth session with rotated refresh token on login', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      ...baseUser,
      passwordHash: await bcrypt.hash('password', 4),
    });
    prismaService.user.update.mockResolvedValue({
      ...baseUser,
      refreshTokenHash: hashToken('refresh-token'),
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.login(' Admin@Example.com ', 'password');

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      {
        sub: baseUser.id,
        email: baseUser.email,
        type: 'access',
      },
      {
        secret: 'access-secret',
        expiresIn: '4h',
      },
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      {
        sub: baseUser.id,
        email: baseUser.email,
        type: 'refresh',
      },
      {
        secret: 'refresh-secret',
        expiresIn: '30d',
      },
    );
    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { refreshTokenHash: hashToken('refresh-token') },
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('refreshTokenHash');
  });

  it('registers a public citizen account and starts a session', async () => {
    prismaService.user.create.mockResolvedValue({
      ...baseUser,
      id: 'citizen-id',
      email: 'user@example.com',
      role: UserRole.Citizen,
      username: 'Бакыт Жумабеков',
      phone: '+996 555 12-34-56',
      pin: '20105199500123',
      passwordHash: 'password-hash',
    });
    prismaService.user.update.mockResolvedValue({
      ...baseUser,
      id: 'citizen-id',
      email: 'user@example.com',
      role: UserRole.Citizen,
      username: 'Бакыт Жумабеков',
      refreshTokenHash: hashToken('refresh-token'),
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.register(
      {
        email: ' User@Example.com ',
        password: 'strong-password',
        fullName: ' Бакыт Жумабеков ',
        phone: ' +996 555 12-34-56 ',
        pin: ' 20105199500123 ',
      },
      '203.0.113.10',
    );

    expect(prismaService.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'user@example.com',
        role: UserRole.Citizen,
        username: 'Бакыт Жумабеков',
        phone: '+996 555 12-34-56',
        pin: '20105199500123',
        disabled: false,
        passwordHash: expect.any(String),
      }),
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.role).toBe(UserRole.Citizen);
    expect(result.user.username).toBe('Бакыт Жумабеков');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('refreshTokenHash');
    expect(result.user).not.toHaveProperty('pin');
  });

  it('maps duplicate registration email to conflict', async () => {
    prismaService.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.register(
        {
          email: 'user@example.com',
          password: 'strong-password',
          fullName: 'Бакыт Жумабеков',
        },
        '203.0.113.10',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rate limits registration attempts by email', async () => {
    const input = {
      email: 'rate@example.com',
      password: 'strong-password',
      fullName: 'A',
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.register(input, '203.0.113.20')).rejects.toThrow(
        'fullName must be at least 2 characters long',
      );
    }

    await expect(service.register(input, '203.0.113.20')).rejects.toThrow(
      'Too many registration attempts for this email',
    );
  });

  it('refreshes a session when the cookie token matches the stored hash', async () => {
    const currentRefreshToken = 'current-refresh-token';

    prismaService.user.findUnique.mockResolvedValue({
      ...baseUser,
      refreshTokenHash: hashToken(currentRefreshToken),
    });
    prismaService.user.update.mockResolvedValue({
      ...baseUser,
      refreshTokenHash: hashToken('next-refresh-token'),
    });
    jwtService.verifyAsync.mockResolvedValue({
      sub: baseUser.id,
      email: baseUser.email,
      type: 'refresh',
    });
    jwtService.signAsync
      .mockResolvedValueOnce('next-access-token')
      .mockResolvedValueOnce('next-refresh-token');

    const result = await service.refresh(currentRefreshToken);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(currentRefreshToken, {
      secret: 'refresh-secret',
    });
    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { refreshTokenHash: hashToken('next-refresh-token') },
    });
    expect(result.accessToken).toBe('next-access-token');
    expect(result.refreshToken).toBe('next-refresh-token');
  });

  it('rejects refresh when the stored hash does not match the cookie token', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      ...baseUser,
      refreshTokenHash: hashToken('different-refresh-token'),
    });
    jwtService.verifyAsync.mockResolvedValue({
      sub: baseUser.id,
      email: baseUser.email,
      type: 'refresh',
    });

    await expect(service.refresh('stale-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('clears the stored refresh token hash on logout', async () => {
    prismaService.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.logout(baseUser.id)).resolves.toEqual({
      success: true,
    });
    expect(prismaService.user.updateMany).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { refreshTokenHash: null },
    });
  });

  it('extracts and manages the refresh cookie', () => {
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    expect(
      service.extractRefreshToken({
        headers: {
          cookie: 'other=value; refreshToken=refresh-token; third=value',
        },
      } as never),
    ).toBe('refresh-token');

    service.setRefreshTokenCookie(response as never, 'refresh-token');
    service.clearRefreshTokenCookie(response as never);

    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/auth',
        maxAge: 2592000000,
      },
    );
    expect(response.clearCookie).toHaveBeenCalledWith('refreshToken', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/auth',
    });
  });

  it('rejects disabled users before issuing tokens', async () => {
    prismaService.user.findUnique.mockResolvedValue({
      ...baseUser,
      disabled: true,
    });

    await expect(
      service.login(baseUser.email, 'password'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
