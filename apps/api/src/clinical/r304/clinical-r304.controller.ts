import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ClinicalFeatureGuard } from '../clinical-feature.guard';
import { ClinicalR304Service } from './clinical-r304.service';
import { CreateEmergencyDelegateDto, CreateEmergencyRelayLinkDto, CreateHealthEpisodeDto, EmergencyTokenDto, LinkHealthResourceDto, ResolveHealthEpisodeDto, SetHealthPrivacyDto, UpdateEmergencySharePolicyDto } from './dto/r304.dto';

@Controller('clinical/r304')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalR304Controller {
  constructor(private readonly clinical: ClinicalR304Service) {}
  @Get('me/history') history(@CurrentAuth() auth: AuthContext) { return this.clinical.history(auth); }
  @Post('me/episodes') createEpisode(@CurrentAuth() auth: AuthContext, @Body() dto: CreateHealthEpisodeDto) { return this.clinical.createEpisode(auth, dto); }
  @Post('me/episodes/:id/resolve') resolveEpisode(@CurrentAuth() auth: AuthContext, @Param('id') id: string, @Body() dto: ResolveHealthEpisodeDto) { return this.clinical.resolveEpisode(auth, id, dto); }
  @Post('me/links') linkResource(@CurrentAuth() auth: AuthContext, @Body() dto: LinkHealthResourceDto) { return this.clinical.linkResource(auth, dto); }
  @Put('me/privacy') setPrivacy(@CurrentAuth() auth: AuthContext, @Body() dto: SetHealthPrivacyDto) { return this.clinical.setPrivacy(auth, dto); }
  @Get('me/emergency') emergencySetup(@CurrentAuth() auth: AuthContext) { return this.clinical.emergencySetup(auth); }
  @Put('me/emergency/policy') updateEmergencyPolicy(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateEmergencySharePolicyDto) { return this.clinical.updateEmergencyPolicy(auth, dto); }
  @Post('me/emergency/delegates') addDelegate(@CurrentAuth() auth: AuthContext, @Body() dto: CreateEmergencyDelegateDto) { return this.clinical.addDelegate(auth, dto); }
  @Post('me/emergency/delegates/:id/revoke') revokeDelegate(@CurrentAuth() auth: AuthContext, @Param('id') id: string) { return this.clinical.revokeDelegate(auth, id); }
  @Get('delegate/authorizations') delegateAuthorizations(@CurrentAuth() auth: AuthContext) { return this.clinical.delegateAuthorizations(auth); }
  @Post('delegate/emergency-link') createRelayLink(@CurrentAuth() auth: AuthContext, @Body() dto: CreateEmergencyRelayLinkDto) { return this.clinical.createRelayLink(auth, dto); }
  @Post('access/emergency') useEmergencyLink(@CurrentAuth() auth: AuthContext, @Body() dto: EmergencyTokenDto) { return this.clinical.useEmergencyLink(auth, dto); }
  @Get('shared/structured-history') sharedStructuredHistory(@CurrentAuth() auth: AuthContext, @Query('sessionId') sessionId: string) { return this.clinical.sharedStructuredHistory(auth, sessionId); }
}
