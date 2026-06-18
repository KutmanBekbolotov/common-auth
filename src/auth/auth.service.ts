import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User, UserRole } from '@prisma/client';
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

type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  pin?: string | null;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

const REGISTER_IP_RATE_LIMIT = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

const REGISTER_EMAIL_RATE_LIMIT = {
  limit: 5,
  windowMs: 60 * 60 * 1000,
};

@Injectable()
export class AuthService {
  private readonly registrationRateLimits = new Map<string, RateLimitState>();

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

  async register(
    input: RegisterInput,
    clientIp: string,
  ): Promise<AuthSession> {
    const email = this.normalizeEmail(input.email);

    this.assertRegistrationRateLimit(clientIp, email);

    const fullName = this.normalizeFullName(input.fullName);
    const passwordHash = await bcrypt.hash(
      input.password,
      this.getPasswordSaltRounds(),
    );

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          role: UserRole.Citizen,
          username: fullName,
          phone: this.normalizeOptionalString(input.phone),
          pin: this.normalizeOptionalString(input.pin),
          disabled: false,
        },
      });

      return this.createAuthSession(user);
    } catch (error) {
      this.handleRegistrationCreateError(error);
      throw error;
    }
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

  private normalizeFullName(fullName: string): string {
    const normalizedFullName = fullName.trim();

    if (normalizedFullName.length < 2) {
      throw new BadRequestException(
        'fullName must be at least 2 characters long',
      );
    }

    return normalizedFullName;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private getPasswordSaltRounds(): number {
    return Number(this.configService.get<string>('PASSWORD_SALT_ROUNDS') ?? 12);
  }

  private assertRegistrationRateLimit(clientIp: string, email: string) {
    this.consumeRegistrationRateLimit(
      `ip:${clientIp}`,
      REGISTER_IP_RATE_LIMIT.limit,
      REGISTER_IP_RATE_LIMIT.windowMs,
      'Too many registration attempts from this IP',
    );
    this.consumeRegistrationRateLimit(
      `email:${email}`,
      REGISTER_EMAIL_RATE_LIMIT.limit,
      REGISTER_EMAIL_RATE_LIMIT.windowMs,
      'Too many registration attempts for this email',
    );
  }

  private consumeRegistrationRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    message: string,
  ) {
    const now = Date.now();
    const state = this.registrationRateLimits.get(key);

    if (!state || state.resetAt <= now) {
      this.registrationRateLimits.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (state.count >= limit) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    state.count += 1;
  }

  private handleRegistrationCreateError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('User with this email already exists');
    }
  }
}
