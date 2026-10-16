import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateKnowledgeAlternativeDto } from './dto/create-knowledge-alternative.dto';
import { KnowledgeAlternativeService } from './knowledge-alternative.service';

@Controller('knowledge-alternative')
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
  create(
    @Body()
    createKnowledgeAlternativeDto: CreateKnowledgeAlternativeDto,
  ) {
    return this.knowledgeAlternativeService.create(
      createKnowledgeAlternativeDto,
    );
  }
}
