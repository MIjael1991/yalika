import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
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

  @Post()
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.taskService.create(createTaskDto);
  }
}