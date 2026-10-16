import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CreateKnowledgeTemplateDto } from './dto/create-knowledge-template.dto';
import { KnowledgeService } from './knowledge.service';

/** El conocimiento es compartido por todas las empresas: leer exige sesión; escribir, operador. */
@Controller('knowledge')
@UseGuards(SessionAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  findAll() {
    return this.knowledgeService.findAll();
  }

  @Post()
  @UseGuards(PlatformOperatorGuard)
  create(
    @Body()
    createKnowledgeTemplateDto: CreateKnowledgeTemplateDto,
  ) {
    return this.knowledgeService.create(createKnowledgeTemplateDto);
  }
}
