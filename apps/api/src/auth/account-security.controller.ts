import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentAuth } from './current-auth.decorator';
import type { AuthContext } from './auth.types';
import { SessionAuthGuard } from './session-auth.guard';
import { AccountSecurityService } from './account-security.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AccountSecurityController {
  constructor(private readonly accountSecurity: AccountSecurityService) {}

  @Get('recovery/status')
  recoveryStatus() {
    return this.accountSecurity.getPublicRecoveryStatus();
  }

  @Get('security')
  @UseGuards(SessionAuthGuard)
  security(@CurrentAuth() auth: AuthContext) {
    return this.accountSecurity.getSecurityStatus(auth.user.id);
  }

  @Post('recovery-key')
  @UseGuards(SessionAuthGuard)
  generateRecoveryKey(@CurrentAuth() auth: AuthContext) {
    return this.accountSecurity.generateRecoveryKey(auth.user.id);
  }

  @Post('password/change')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.accountSecurity.changePassword(
      auth.user.id,
      auth.sessionToken,
      dto,
    );
  }

  @Post('password/request')
  @HttpCode(200)
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() request: Request,
  ) {
    return this.accountSecurity.requestPasswordReset(dto.email, request.ip);
  }

  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.accountSecurity.resetPassword(dto);
  }
}
