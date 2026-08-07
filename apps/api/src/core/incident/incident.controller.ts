import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentService } from './incident.service';

@Controller('incident')
export class IncidentController {
  constructor(
    private readonly incidentService: IncidentService,
  ) {}

  @Get()
  findAll() {
    return this.incidentService.findAll();
  }

  @Post()
  create(@Body() createIncidentDto: CreateIncidentDto) {
    return this.incidentService.create(createIncidentDto);
  }

  @Post(':id/generate-alternatives')
  generateAlternatives(@Param('id') id: string) {
    return this.incidentService.generateAlternativesFromKnowledge(
      id,
    );
  }
}