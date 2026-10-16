import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import type { AuthContext } from '../../../auth/auth.types';
import { CurrentAuth } from '../../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../../auth/session-auth.guard';
import { AlternativeService } from './alternative.service';
import { CreateAlternativeDto } from './dto/create-alternative.dto';

@Controller('incident-alternative')
@UseGuards(SessionAuthGuard)
export class AlternativeController {
  constructor(private readonly alternativeService: AlternativeService) {}

  @Get('incident/:incidentId')
  findByIncident(
    @CurrentAuth() auth: AuthContext,
    @Param('incidentId') incidentId: string,
  ) {
    return this.alternativeService.findByIncident(
      incidentId,
      auth.user.companyId,
    );
  }

  @Get('incident/:incidentId/analyze')
  analyze(
    @CurrentAuth() auth: AuthContext,
    @Param('incidentId') incidentId: string,
  ) {
    return this.alternativeService.analyze(incidentId, auth.user.companyId);
  }

  @Post(':id/select')
  select(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.alternativeService.select(id, auth.user.companyId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() createAlternativeDto: CreateAlternativeDto,
  ) {
    return this.alternativeService.create(
      createAlternativeDto,
      auth.user.companyId,
    );
  }
}
