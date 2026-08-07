import { Body, Controller, Get, Post } from '@nestjs/common';

import { CreateKnowledgeTemplateDto } from './dto/create-knowledge-template.dto';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Get()
  findAll() {
    return this.knowledgeService.findAll();
  }

  @Post()
  create(
    @Body()
    createKnowledgeTemplateDto: CreateKnowledgeTemplateDto,
  ) {
    return this.knowledgeService.create(
      createKnowledgeTemplateDto,
    );
  }
}           