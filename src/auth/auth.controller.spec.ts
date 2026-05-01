import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    setRefreshTokenCookie: jest.Mock;
    clearRefreshTokenCookie: jest.Mock;
    extractRefreshToken: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      login: jest.fn(),
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
