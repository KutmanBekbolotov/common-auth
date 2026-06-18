import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    register: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    setRefreshTokenCookie: jest.Mock;
    clearRefreshTokenCookie: jest.Mock;
    extractRefreshToken: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      register: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      setRefreshTokenCookie: jest.fn(),
      clearRefreshTokenCookie: jest.fn(),
      extractRefreshToken: jest.fn(),
    };

    controller = new AuthController(authService as never);
  });

  it('returns the public auth payload and sets the refresh cookie on login', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      currentUser: { id: '1', uid: '1', email: 'admin@example.com' },
      user: { id: '1' },
      userProfile: { id: '1' },
      userRole: 'admin',
      orgId: null,
      departmentId: null,
      scope: {
        role: 'admin',
        orgId: null,
        departmentId: null,
        permissions: { cloud: true },
      },
      permissions: { cloud: true },
    });

    const response = {};
    const result = await controller.login(
      { email: 'admin@example.com', password: 'password' },
      response as never,
    );

    expect(authService.setRefreshTokenCookie).toHaveBeenCalledWith(
      response,
      'refresh-token',
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      currentUser: { id: '1', uid: '1', email: 'admin@example.com' },
      user: { id: '1' },
      userProfile: { id: '1' },
      userRole: 'admin',
      orgId: null,
      departmentId: null,
      scope: {
        role: 'admin',
        orgId: null,
        departmentId: null,
        permissions: { cloud: true },
      },
      permissions: { cloud: true },
    });
  });

  it('returns the public auth payload and sets the refresh cookie on registration', async () => {
    authService.register.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      currentUser: { id: '1', uid: '1', email: 'user@example.com' },
      user: { id: '1', role: 'Citizen' },
      userProfile: { id: '1', role: 'Citizen' },
      userRole: 'Citizen',
      orgId: null,
      departmentId: null,
      scope: {
        role: 'Citizen',
        orgId: null,
        departmentId: null,
        permissions: { cloud: false },
      },
      permissions: { cloud: false },
    });

    const response = {};
    const result = await controller.register(
      {
        email: 'user@example.com',
        password: 'strong-password',
        fullName: 'Бакыт Жумабеков',
        phone: '+996 555 12-34-56',
        pin: '20105199500123',
      },
      {
        headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
        ip: '127.0.0.1',
      } as never,
      response as never,
    );

    expect(authService.register).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        password: 'strong-password',
        fullName: 'Бакыт Жумабеков',
        phone: '+996 555 12-34-56',
        pin: '20105199500123',
      },
      '203.0.113.10',
    );
    expect(authService.setRefreshTokenCookie).toHaveBeenCalledWith(
      response,
      'refresh-token',
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      currentUser: { id: '1', uid: '1', email: 'user@example.com' },
      user: { id: '1', role: 'Citizen' },
      userProfile: { id: '1', role: 'Citizen' },
      userRole: 'Citizen',
      orgId: null,
      departmentId: null,
      scope: {
        role: 'Citizen',
        orgId: null,
        departmentId: null,
        permissions: { cloud: false },
      },
      permissions: { cloud: false },
    });
  });

  it('clears the refresh cookie when refresh fails', async () => {
    const response = {};
    const error = new UnauthorizedException();

    authService.extractRefreshToken.mockReturnValue('stale-token');
    authService.refresh.mockRejectedValue(error);

    await expect(
      controller.refresh(
        { headers: { cookie: 'refreshToken=stale-token' } } as never,
        response as never,
      ),
    ).rejects.toBe(error);
    expect(authService.clearRefreshTokenCookie).toHaveBeenCalledWith(response);
  });

  it('clears the refresh cookie and stored session on logout', async () => {
    const response = {};

    authService.logout.mockResolvedValue({ success: true });

    await expect(
      controller.logout(
        { user: { id: 'user-id' } } as never,
        response as never,
      ),
    ).resolves.toEqual({ success: true });
    expect(authService.clearRefreshTokenCookie).toHaveBeenCalledWith(response);
    expect(authService.logout).toHaveBeenCalledWith('user-id');
  });
});
