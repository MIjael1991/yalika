import { Controller, Get, UseGuards } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ExperienceService } from './experience.service';

@Controller('experience')
@UseGuards(SessionAuthGuard)
export class ExperienceController {
  constructor(private readonly experienceService: ExperienceService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    return this.experienceService.findAll(auth.user.companyId);
  }
}
