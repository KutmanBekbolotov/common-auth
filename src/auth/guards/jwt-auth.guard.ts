import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_TOKEN_TYPE } from '../auth.constants';
import type { AuthenticatedRequest } from '../types/authenticated-request.type';
import type { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authorization bearer token is required');
    }

    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type && payload.type !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        username: true,
        orgId: true,
        departmentId: true,
        photoUrl: true,
        disabled: true,
      },
    });

    if (!user || user.disabled) {
      throw new UnauthorizedException('User is disabled or no longer exists');
    }

    (request as AuthenticatedRequest).user = user;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
