import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { type AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  CompleteTaskDto,
  PostponeTaskDto,
} from './dto/task-action.dto';
import { TaskService } from './task.service';

@Controller('task')
@UseGuards(SessionAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    return this.taskService.findAll(auth.user.companyId, auth.user.id);
  }

  @Get('today')
  findToday(@CurrentAuth() auth: AuthContext) {
    return this.taskService.findToday(auth.user.companyId, auth.user.id);
  }

  @Get('today/priority/:priority')
  findTodayByPriority(
    @Param('priority') priority: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.taskService.findTodayByPriority(
      priority,
      auth.user.companyId,
      auth.user.id,
    );
  }

  @Get('space/:spaceId')
  findBySpace(
    @Param('spaceId') spaceId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.taskService.findBySpace(spaceId, auth.user.id);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentAuth() auth: AuthContext) {
    return this.taskService.create(
      dto,
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.taskService.claim(id, auth.user.id);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteTaskDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.taskService.complete(id, auth.user.id, dto);
  }

  @Post(':id/postpone')
  postpone(
    @Param('id') id: string,
    @Body() dto: PostponeTaskDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.taskService.postpone(id, auth.user.id, dto);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.taskService.reopen(id, auth.user.id);
  }

  @Post(':id/recurrence/cancel')
  cancelRecurrence(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.taskService.cancelRecurrence(id, auth.user.id);
  }
}
