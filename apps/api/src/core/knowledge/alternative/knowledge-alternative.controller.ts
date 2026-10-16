import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { PlatformOperatorGuard } from '../../../auth/platform-operator.guard';
import { SessionAuthGuard } from '../../../auth/session-auth.guard';
import { CreateKnowledgeAlternativeDto } from './dto/create-knowledge-alternative.dto';
import { KnowledgeAlternativeService } from './knowledge-alternative.service';

/** Conocimiento compartido: leer exige sesión; escribir, operador de plataforma. */
@Controller('knowledge-alternative')
@UseGuards(SessionAuthGuard)
export class KnowledgeAlternativeController {
  constructor(
    private readonly knowledgeAlternativeService: KnowledgeAlternativeService,
  ) {}

  @Get('knowledge/:knowledgeTemplateId')
  findByKnowledge(@Param('knowledgeTemplateId') knowledgeTemplateId: string) {
    return this.knowledgeAlternativeService.findByKnowledge(
      knowledgeTemplateId,
    );
  }

  @Post()
  @UseGuards(PlatformOperatorGuard)
  create(
    @Body()
    createKnowledgeAlternativeDto: CreateKnowledgeAlternativeDto,
  ) {
    return this.knowledgeAlternativeService.create(
      createKnowledgeAlternativeDto,
    );
  }
}
