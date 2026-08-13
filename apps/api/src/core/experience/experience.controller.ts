import { Controller, Get } from '@nestjs/common';

import { ExperienceService } from './experience.service';

@Controller('experience')
export class ExperienceController {
  constructor(
    private readonly experienceService: ExperienceService,
  ) {}

  @Get()
  findAll() {
    return this.experienceService.findAll();
  }
}