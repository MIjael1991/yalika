import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityAccessService } from '../mobility-access.service';
import { MobilityPhase3Service } from './phase3.service';
import {
  CreateBonusCampaignDto,
  CreateFareQuoteDto,
  CreatePricingPolicyDto,
  CreateServicePaymentPlanDto,
  CreateShareSessionDto,
  CreditTripEarningsDto,
  DeviceHeartbeatDto,
  OpportunityPreferenceDto,
} from './phase3.dto';

@Controller('mobility')
export class MobilityPhase3Controller {
  constructor(
    private readonly phase3: MobilityPhase3Service,
    private readonly access: MobilityAccessService,
  ) {}

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('pricing/policies')
  createPricingPolicy(@Body() dto: CreatePricingPolicyDto) {
    return this.phase3.createPricingPolicy(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('pricing/policies/active')
  activePricingPolicy(@Query('city') city?: string) {
    return this.phase3.activePricingPolicy(city);
  }

  @UseGuards(SessionAuthGuard)
  @Post('pricing/quote')
  quote(@Body() dto: CreateFareQuoteDto, @Query('city') city?: string) {
    return this.phase3.quote(dto, city);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('wallet/credit-trip')
  creditTrip(@Body() dto: CreditTripEarningsDto) {
    return this.phase3.creditTripEarnings(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('wallet/:driverId')
  async wallet(
    @CurrentAuth() auth: AuthContext,
    @Param('driverId') driverId: string,
  ) {
    await this.access.driverAccess(auth, driverId);
    return this.phase3.walletSummary(driverId);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('bonuses/campaigns')
  createBonusCampaign(@Body() dto: CreateBonusCampaignDto) {
    return this.phase3.createBonusCampaign(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('devices/heartbeat')
  async heartbeat(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: DeviceHeartbeatDto,
  ) {
    if (dto.driverId) {
      await this.access.driverAccess(auth, dto.driverId);
      if (dto.vehicleId) {
        await this.access.vehicleOfDriver(dto.vehicleId, dto.driverId);
      }
    }
    if (dto.tripId) await this.access.tripAccess(auth, dto.tripId);
    if (dto.userId || !dto.driverId) {
      dto.userId = this.access.selfUser(auth, dto.userId);
    }
    return this.phase3.heartbeat(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('trips/:tripId/risk-assessment')
  async assessRisk(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    await this.access.tripAccess(auth, tripId);
    return this.phase3.assessTripRisk(tripId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('trips/:tripId/share')
  async share(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateShareSessionDto,
  ) {
    await this.access.tripAccess(auth, tripId);
    dto.ownerUserId = this.access.selfUser(auth, dto.ownerUserId);
    return this.phase3.createShareSession(tripId, dto);
  }

  @Get('shared/:token')
  sharedTrip(@Param('token') token: string) {
    return this.phase3.sharedTrip(token);
  }

  @UseGuards(SessionAuthGuard)
  @Post('opportunity/preferences')
  opportunityPreference(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: OpportunityPreferenceDto,
  ) {
    dto.userId = this.access.selfUser(auth, dto.userId);
    return this.phase3.upsertOpportunityPreference(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('service-payment-plans')
  async servicePaymentPlan(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateServicePaymentPlanDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.phase3.createServicePaymentPlan(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('service-payment-plans/:driverId')
  async servicePaymentPlans(
    @CurrentAuth() auth: AuthContext,
    @Param('driverId') driverId: string,
  ) {
    await this.access.driverAccess(auth, driverId);
    return this.phase3.servicePaymentPlans(driverId);
  }

  @UseGuards(SessionAuthGuard)
  @Get('dashboard/driver/:driverId')
  async dashboard(
    @CurrentAuth() auth: AuthContext,
    @Param('driverId') driverId: string,
  ) {
    await this.access.driverAccess(auth, driverId);
    return this.phase3.dashboard(driverId);
  }
}
