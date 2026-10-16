import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PublicReservationController } from './public-reservation.controller';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  imports: [AuthModule],
  controllers: [
    PublicReservationController,
    ReservationController,
  ],
  providers: [ReservationService],
  exports: [ReservationService],
})
export class ReservationModule {}
