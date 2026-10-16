import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { TaskModule } from '../task/task.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';

@Module({
  imports: [AuthModule, TaskModule],
  controllers: [BriefingController],
  providers: [BriefingService],
})
export class BriefingModule {}
