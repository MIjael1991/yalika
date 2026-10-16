import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';

import { type AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { BriefingService } from './briefing.service';

@Controller('briefing')
@UseGuards(SessionAuthGuard)
export class BriefingController {
  constructor(private readonly briefingService: BriefingService) {}

  @Get('today')
  findToday(@CurrentAuth() auth: AuthContext) {
    if (!auth.user.modules.includes('all')) {
      throw new ForbiddenException('No tienes acceso al resumen personal');
    }
    return this.briefingService.findToday(
      auth.user.companyId,
      auth.user.id,
      auth.user.name,
    );
  }
}
