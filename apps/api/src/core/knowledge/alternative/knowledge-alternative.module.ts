import { Module } from '@nestjs/common';

import { AuthModule } from '../../../auth/auth.module';

import { KnowledgeAlternativeController } from './knowledge-alternative.controller';
import { KnowledgeAlternativeService } from './knowledge-alternative.service';

@Module({
  imports: [AuthModule],
  controllers: [KnowledgeAlternativeController],
  providers: [KnowledgeAlternativeService],
})
export class KnowledgeAlternativeModule {}
