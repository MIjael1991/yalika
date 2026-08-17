import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CreateTaskDto } from './dto/create-task.dto';
import {
  CompleteTaskDto,
  PostponeTaskDto,
  TaskActorDto,
} from './dto/task-action.dto';
import { TaskService } from './task.service';

@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  findAll() {
    return this.taskService.findAll();
  }

  @Get('today')
  findToday() {
    return this.taskService.findToday();
  }

  @Get('today/priority/:priority')
  findTodayByPriority(@Param('priority') priority: string) {
    return this.taskService.findTodayByPriority(priority);
  }

  @Get('space/:spaceId')
  findBySpace(
    @Param('spaceId') spaceId: string,
    @Query('actorUserId') actorUserId: string,
  ) {
    return this.taskService.findBySpace(spaceId, actorUserId);
  }

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.taskService.create(dto);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @Body() dto: TaskActorDto) {
    return this.taskService.claim(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() dto: CompleteTaskDto) {
    return this.taskService.complete(id, dto);
  }

  @Post(':id/postpone')
  postpone(@Param('id') id: string, @Body() dto: PostponeTaskDto) {
    return this.taskService.postpone(id, dto);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Body() dto: TaskActorDto) {
    return this.taskService.reopen(id, dto);
  }
}
