import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';
import ms, { type StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { toAuthContextResponse } from '../users/user.presenter';
import {
  ACCESS_TOKEN_TYPE,
  AUTH_COOKIE_PATH,
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TYPE,
} from './auth.constants';
import type { AuthSession } from './types/auth-session.type';
import type { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.disabled) {
      throw new ForbiddenException('User is disabled');
    }

    const passwordIsValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthSession(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return toAuthContextResponse(user);
  }

  async refresh(refreshToken: string | null): Promise<AuthSession> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.disabled || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh session is invalid');
    }

    if (user.refreshTokenHash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Refresh session is invalid');
    }

    return this.createAuthSession(user);
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { success: true };
  }

  extractRefreshToken(request: Request): string | null {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const prefix = `${REFRESH_TOKEN_COOKIE_NAME}=`;

    for (const item of cookieHeader.split(';')) {
      const trimmedItem = item.trim();

      if (trimmedItem.startsWith(prefix)) {
        return decodeURIComponent(trimmedItem.slice(prefix.length));
      }
    }

    return null;
  }

  setRefreshTokenCookie(response: Response, refreshToken: string) {
    response.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      refreshToken,
      this.getRefreshCookieOptions(),
    );
  }

  clearRefreshTokenCookie(response: Response) {
    response.clearCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      this.getRefreshCookieClearOptions(),
    );
  }

  private async createAuthSession(user: User): Promise<AuthSession> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.signRefreshToken(user),
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashToken(refreshToken) },
    });

    return {
      accessToken,
      refreshToken,
      ...toAuthContextResponse(user),
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: ACCESS_TOKEN_TYPE,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.getAccessTokenSecret(),
      expiresIn: (this.configService.get<string>('JWT_ACCESS_TTL') ??
        DEFAULT_ACCESS_TOKEN_TTL) as StringValue,
    });
  }

  private async signRefreshToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: REFRESH_TOKEN_TYPE,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.getRefreshTokenSecret(),
      expiresIn: this.getRefreshTokenTtl(),
    });
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type && payload.type !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  private getAccessTokenSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    return secret;
  }

  private getRefreshTokenSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.getAccessTokenSecret()
    );
  }

  private getRefreshTokenTtl(): StringValue {
    return (this.configService.get<string>('JWT_REFRESH_TTL') ??
      DEFAULT_REFRESH_TOKEN_TTL) as StringValue;
  }

  private getRefreshCookieOptions(): CookieOptions {
    const maxAge = ms(this.getRefreshTokenTtl());

    if (typeof maxAge !== 'number') {
      throw new BadRequestException('JWT_REFRESH_TTL must be a valid duration');
    }

    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      path: AUTH_COOKIE_PATH,
      maxAge,
    };
  }

  private getRefreshCookieClearOptions(): CookieOptions {
    const { httpOnly, path, sameSite, secure } = this.getRefreshCookieOptions();

    return {
      httpOnly,
      path,
      sameSite,
      secure,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
