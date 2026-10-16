import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { type AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { SnoozeReminderDto } from './dto/snooze-reminder.dto';
import { ReminderService } from './reminder.service';

@Controller('reminder')
@UseGuards(SessionAuthGuard)
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get()
  findForUser(@CurrentAuth() auth: AuthContext) {
    return this.reminderService.findForUser(auth.user.id);
  }

  @Post(':id/snooze')
  snooze(
    @Param('id') id: string,
    @Body() dto: SnoozeReminderDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.reminderService.snooze(id, auth.user.id, dto.minutes);
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.reminderService.acknowledge(id, auth.user.id);
  }
}
