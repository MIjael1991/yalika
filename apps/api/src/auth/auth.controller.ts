import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import {
  type AuthContext,
  sessionCookieName,
} from './auth.types';
import { CurrentAuth } from './current-auth.decorator';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './session-auth.guard';

function getIpAddress(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];

  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }

  return forwarded?.split(',')[0]?.trim() || request.ip;
}

function getCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(dto, {
      ipAddress: getIpAddress(request),
      userAgent: request.headers['user-agent'],
    });

    response.cookie(
      sessionCookieName,
      session.token,
      getCookieOptions(session.expiresAt),
    );

    return {
      expiresAt: session.expiresAt,
      user: session.user,
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentAuth() auth: AuthContext) {
    return {
      expiresAt: auth.expiresAt,
      user: auth.user,
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(auth.sessionToken);
    response.clearCookie(sessionCookieName, getCookieOptions());
  }
}
