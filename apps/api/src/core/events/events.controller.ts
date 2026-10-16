import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(SessionAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    const roleName = (auth.user.role?.name ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    if (roleName !== 'administrador') {
      throw new ForbiddenException('No tienes permiso para consultar eventos');
    }

    return this.eventsService.findAll(auth.user.companyId);
  }

  @Post()
  create(): never {
    throw new ForbiddenException(
      'La creación de eventos por HTTP está deshabilitada',
    );
  }
}
