import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';

import { SessionAuthGuard } from '../../auth/session-auth.guard';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { AssistantPreferenceService } from './assistant-preference.service';
import { UpdateAssistantPreferenceDto } from './dto/update-assistant-preference.dto';
import { UpdateVisibleModulesDto } from './dto/update-visible-modules.dto';

@Controller('assistant-preference')
@UseGuards(SessionAuthGuard)
export class AssistantPreferenceController {
  constructor(
    private readonly assistantPreferenceService: AssistantPreferenceService,
  ) {}

  @Get()
  findMine(@Req() request: AuthenticatedRequest) {
    return this.assistantPreferenceService.findForUser(
      request.auth.user.id,
      request.auth.user.name,
    );
  }

  @Patch()
  updateMine(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateAssistantPreferenceDto,
  ) {
    return this.assistantPreferenceService.updateForUser(
      request.auth.user.id,
      request.auth.user.name,
      dto,
    );
  }
  @Get('modules')
  findMyModules(@Req() request: AuthenticatedRequest) {
    return this.assistantPreferenceService.findVisibleForUser(
      request.auth.user.id,
      request.auth.user.modules,
    );
  }

  @Patch('modules')
  updateMyModules(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateVisibleModulesDto,
  ) {
    return this.assistantPreferenceService.updateVisibleForUser(
      request.auth.user.id,
      request.auth.user.modules,
      dto.visibleModules,
    );
  }
}
