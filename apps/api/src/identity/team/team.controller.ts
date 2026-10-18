import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { requireNotCashier } from '../../auth/tenant-policy';
import {
  CreateCashierDto,
  ResetCashierPasswordDto,
  SetCashierPermissionsDto,
  SetCashierStatusDto,
} from './team.dto';
import { TeamService } from './team.service';

/** Todo el equipo se administra desde la sesión del administrador. */
@Controller('team')
@UseGuards(SessionAuthGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    requireNotCashier(auth);
    return this.team.list(auth.user.companyId);
  }

  @Post('cashiers')
  create(@Body() dto: CreateCashierDto, @CurrentAuth() auth: AuthContext) {
    requireNotCashier(auth);
    return this.team.createCashier(auth.user.companyId, auth.user.id, dto);
  }

  @Patch('cashiers/:userId/status')
  setStatus(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: SetCashierStatusDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireNotCashier(auth);
    return this.team.setStatus(auth.user.companyId, auth.user.id, userId, dto);
  }

  @Patch('cashiers/:userId/permissions')
  setPermissions(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: SetCashierPermissionsDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireNotCashier(auth);
    return this.team.setPermissions(
      auth.user.companyId,
      auth.user.id,
      userId,
      dto,
    );
  }

  @Post('cashiers/:userId/password')
  resetPassword(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: ResetCashierPasswordDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireNotCashier(auth);
    return this.team.resetPassword(
      auth.user.companyId,
      auth.user.id,
      userId,
      dto,
    );
  }
}
