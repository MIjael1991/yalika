import { Controller, Get } from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('today')
  getToday(@CurrentAuth() auth: AuthContext) {
    return this.operationsService.getToday(auth.user.companyId);
  }
}
