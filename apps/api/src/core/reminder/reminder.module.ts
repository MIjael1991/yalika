import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';

@Module({
  imports: [AuthModule],
  controllers: [ReminderController, PushController],
  providers: [ReminderService, PushService],
})
export class ReminderModule {}
