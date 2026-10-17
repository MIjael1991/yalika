import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  assertOwnCompany,
  requireCommercialAccount,
  requireNotCashier,
} from '../../auth/tenant-policy';
import { ConfirmReservationDepositDto } from './dto/confirm-reservation-deposit.dto';
import { ExtendReservationDto } from './dto/extend-reservation.dto';
import { ReleaseReservationDto } from './dto/release-reservation.dto';
import { UpdateReservationPolicyDto } from './dto/update-reservation-policy.dto';
import { ReservationService } from './reservation.service';

/**
 * Permisos del cajero en Apartados: puede consultar, confirmar el anticipo,
 * convertir en venta, cobrar el saldo y completar (todo es cobrar). Extender el
 * plazo, liberar mercancía y cambiar la política son del administrador.
 * Esta raíz no pasa por commerce-access.guard, por eso se decide aquí.
 */
@Controller('reservation')
@UseGuards(SessionAuthGuard)
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Get('company/:companyId')
  list(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    assertOwnCompany(auth, companyId);
    return this.reservationService.listCompany(companyId);
  }

  @Get('company/:companyId/policy')
  policy(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    assertOwnCompany(auth, companyId);
    return this.reservationService.getPolicy(companyId);
  }

  @Put('company/:companyId/policy')
  updatePolicy(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateReservationPolicyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireNotCashier(auth);
    assertOwnCompany(auth, companyId);
    return this.reservationService.updatePolicy(companyId, dto);
  }

  @Post('company/:companyId/expire')
  expire(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    assertOwnCompany(auth, companyId);
    return this.reservationService.expire(companyId);
  }

  @Post(':id/confirm-deposit')
  confirmDeposit(
    @Param('id') id: string,
    @Body() dto: ConfirmReservationDepositDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    return this.reservationService.confirmDeposit(
      auth.user.companyId,
      id,
      dto,
      auth.user.id,
    );
  }

  @Post(':id/extend')
  extend(
    @Param('id') id: string,
    @Body() dto: ExtendReservationDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireNotCashier(auth);
    return this.reservationService.extend(
      auth.user.companyId,
      id,
      dto,
      auth.user.id,
    );
  }

  @Post(':id/release')
  release(
    @Param('id') id: string,
    @Body() dto: ReleaseReservationDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireNotCashier(auth);
    return this.reservationService.release(
      auth.user.companyId,
      id,
      dto,
      auth.user.id,
    );
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    requireCommercialAccount(auth);
    return this.reservationService.complete(
      auth.user.companyId,
      id,
      auth.user.id,
    );
  }
}
