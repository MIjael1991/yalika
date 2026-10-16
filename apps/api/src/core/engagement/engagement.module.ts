import { Module } from '@nestjs/common';

import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { ScratchModule } from '../scratch/scratch.module';

@Module({
  imports: [ScratchModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
