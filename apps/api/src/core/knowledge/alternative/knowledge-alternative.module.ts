import { Module } from '@nestjs/common';

import { KnowledgeAlternativeController } from './knowledge-alternative.controller';
import { KnowledgeAlternativeService } from './knowledge-alternative.service';

@Module({
  controllers: [KnowledgeAlternativeController],
  providers: [KnowledgeAlternativeService],
})
export class KnowledgeAlternativeModule {}
