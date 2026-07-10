import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthSession } from './types/auth-session.type';
import type { AuthenticatedRequest } from './types/authenticated-request.type';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(
      dto.email,
      dto.password,
      this.getClientIp(request),
    );

    this.authService.setRefreshTokenCookie(response, session.refreshToken);

    return this.toPublicAuthSession(session);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a public citizen account' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.register(
      dto,
      this.getClientIp(request),
    );

    this.authService.setRefreshTokenCookie(response, session.refreshToken);

    return this.toPublicAuthSession(session);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token using httpOnly refresh cookie',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.authService.extractRefreshToken(request);

    try {
      const session = await this.authService.refresh(refreshToken);

      this.authService.setRefreshTokenCookie(response, session.refreshToken);

      return this.toPublicAuthSession(session);
    } catch (error) {
      this.authService.clearRefreshTokenCookie(response);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user auth context' })
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current access-token session' })
  logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.authService.clearRefreshTokenCookie(response);

    return this.authService.logout(request.user.id);
  }

  private toPublicAuthSession(session: AuthSession) {
    const { refreshToken, ...responseBody } = session;
    void refreshToken;

    return responseBody;
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
      return forwardedFor[0] ?? request.ip ?? 'unknown';
    }

    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() || request.ip || 'unknown';
    }

    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
