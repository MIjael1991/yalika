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
  constructor(private readonly phase3: MobilityPhase3Service) {}

  @UseGuards(SessionAuthGuard)
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

  @UseGuards(SessionAuthGuard)
  @Post('wallet/credit-trip')
  creditTrip(@Body() dto: CreditTripEarningsDto) {
    return this.phase3.creditTripEarnings(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('wallet/:driverId')
  wallet(@Param('driverId') driverId: string) {
    return this.phase3.walletSummary(driverId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('bonuses/campaigns')
  createBonusCampaign(@Body() dto: CreateBonusCampaignDto) {
    return this.phase3.createBonusCampaign(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('devices/heartbeat')
  heartbeat(@Body() dto: DeviceHeartbeatDto) {
    return this.phase3.heartbeat(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('trips/:tripId/risk-assessment')
  assessRisk(@Param('tripId') tripId: string) {
    return this.phase3.assessTripRisk(tripId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('trips/:tripId/share')
  share(@Param('tripId') tripId: string, @Body() dto: CreateShareSessionDto) {
    return this.phase3.createShareSession(tripId, dto);
  }

  @Get('shared/:token')
  sharedTrip(@Param('token') token: string) {
    return this.phase3.sharedTrip(token);
  }

  @UseGuards(SessionAuthGuard)
  @Post('opportunity/preferences')
  opportunityPreference(@Body() dto: OpportunityPreferenceDto) {
    return this.phase3.upsertOpportunityPreference(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('service-payment-plans')
  servicePaymentPlan(@Body() dto: CreateServicePaymentPlanDto) {
    return this.phase3.createServicePaymentPlan(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('service-payment-plans/:driverId')
  servicePaymentPlans(@Param('driverId') driverId: string) {
    return this.phase3.servicePaymentPlans(driverId);
  }

  @UseGuards(SessionAuthGuard)
  @Get('dashboard/driver/:driverId')
  dashboard(@Param('driverId') driverId: string) {
    return this.phase3.dashboard(driverId);
  }
}
