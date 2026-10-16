import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import { ReportReservationDepositDto } from './dto/report-reservation-deposit.dto';
import { ReservationService } from './reservation.service';

@Controller('reservation/public')
export class PublicReservationController {
  constructor(
    private readonly reservationService: ReservationService,
  ) {}

  @Get('site/:slug/catalog')
  catalog(@Param('slug') slug: string) {
    return this.reservationService.publicCatalog(slug);
  }

  @Post('hold')
  hold(@Body() dto: CreateReservationHoldDto) {
    return this.reservationService.createPublicHold(dto);
  }

  @Get(':token')
  findByToken(@Param('token') token: string) {
    return this.reservationService.publicByToken(token);
  }

  @Post(':token/report-deposit')
  reportDeposit(
    @Param('token') token: string,
    @Body() dto: ReportReservationDepositDto,
  ) {
    return this.reservationService.reportDeposit(token, dto);
  }

  @Post(':token/cancel')
  cancel(@Param('token') token: string) {
    return this.reservationService.cancelPublic(token);
  }
}
