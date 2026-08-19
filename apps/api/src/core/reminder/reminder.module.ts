import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';

@Module({
  imports: [AuthModule],
  controllers: [ReminderController],
  providers: [ReminderService],
})
export class ReminderModule {}
