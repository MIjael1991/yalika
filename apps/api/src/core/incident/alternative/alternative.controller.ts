import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { AlternativeService } from './alternative.service';
import { CreateAlternativeDto } from './dto/create-alternative.dto';

@Controller('incident-alternative')
export class AlternativeController {
  constructor(private readonly alternativeService: AlternativeService) {}

  @Get('incident/:incidentId')
  findByIncident(@Param('incidentId') incidentId: string) {
    return this.alternativeService.findByIncident(incidentId);
  }

  @Get('incident/:incidentId/analyze')
  analyze(@Param('incidentId') incidentId: string) {
    return this.alternativeService.analyze(incidentId);
  }

  @Post(':id/select')
  select(@Param('id') id: string) {
    return this.alternativeService.select(id);
  }

  @Post()
  create(@Body() createAlternativeDto: CreateAlternativeDto) {
    return this.alternativeService.create(createAlternativeDto);
  }
}
