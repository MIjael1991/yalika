import { Controller, Get } from '@nestjs/common';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(
    private readonly operationsService: OperationsService,
  ) {}

  @Get('today')
  getToday() {
    return this.operationsService.getToday();
  }
}