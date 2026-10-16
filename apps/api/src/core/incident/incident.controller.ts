import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentService } from './incident.service';

@Controller('incident')
@UseGuards(SessionAuthGuard)
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    return this.incidentService.findAll(auth.user.companyId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() createIncidentDto: CreateIncidentDto,
  ) {
    return this.incidentService.create(createIncidentDto, auth.user.companyId);
  }

  @Post(':id/generate-alternatives')
  generateAlternatives(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.incidentService.generateAlternativesFromKnowledge(
      id,
      auth.user.companyId,
    );
  }
}
