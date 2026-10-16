import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ClinicalFeatureGuard } from '../clinical-feature.guard';
import { ClinicalR303Service } from './clinical-r303.service';
import { ClinicalR303AssistantDto, CreateChronicConditionDto, UpdateEmergencyProfileDto } from './dto/r303.dto';

@Controller('clinical/r303')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalR303Controller {
  constructor(private readonly clinical: ClinicalR303Service) {}

  @Get('me/home')
  home(@CurrentAuth() auth: AuthContext) {
    return this.clinical.home(auth);
  }

  @Put('me/essentials')
  updateEssentials(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateEmergencyProfileDto) {
    return this.clinical.updateEssentials(auth, dto);
  }

  @Post('me/chronic-conditions')
  createChronicCondition(@CurrentAuth() auth: AuthContext, @Body() dto: CreateChronicConditionDto) {
    return this.clinical.createChronicCondition(auth, dto);
  }

  @Post('me/chronic-conditions/:id/deactivate')
  deactivateChronicCondition(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clinical.deactivateChronicCondition(auth, id);
  }

  @Post('assistant/query')
  assistant(@CurrentAuth() auth: AuthContext, @Body() dto: ClinicalR303AssistantDto) {
    return this.clinical.assistant(auth, dto.query);
  }
}
