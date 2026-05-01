import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { toAuthContextResponse } from '../users/user.presenter';
import type { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string) {
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

    return {
      accessToken: await this.signAccessToken(user),
      ...toAuthContextResponse(user),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return toAuthContextResponse(user);
  }

  logout() {
    return { success: true };
  }

  private async signAccessToken(user: User): Promise<string> {
    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: (this.configService.get<string>('JWT_ACCESS_TTL') ??
        '15m') as StringValue,
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
