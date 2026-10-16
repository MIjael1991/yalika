import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityAccessService } from '../mobility-access.service';
import { MobilityPhase5Service } from './phase5.service';
import {
  CheckTripPinDto,
  CreateReferralCampaignDto,
  CreateReferralCodeDto,
  CreateSafeRideDto,
  CreateSafeRideIncidentDto,
  CreateSafeRideShareDto,
  EvaluateReferralDto,
  RedeemReferralDto,
  ReviewIdentityDto,
  ReviewVehicleComplianceDto,
  SafeRideLocationDto,
  StartSafeRideDto,
  UpsertVehicleComplianceDto,
  UpsertVerificationProfileDto,
  VerifyPhoneDto,
} from './phase5.dto';

@Controller('mobility')
export class MobilityPhase5Controller {
  constructor(
    private readonly phase5: MobilityPhase5Service,
    private readonly access: MobilityAccessService,
  ) {}

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('referrals/campaigns')
  createReferralCampaign(@Body() dto: CreateReferralCampaignDto) {
    return this.phase5.createReferralCampaign(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('referrals/codes')
  async createReferralCode(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateReferralCodeDto,
  ) {
    dto.ownerUserId = this.access.selfUser(auth, dto.ownerUserId);
    if (dto.ownerDriverId) {
      await this.access.driverAccess(auth, dto.ownerDriverId);
    }
    return this.phase5.createReferralCode(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('referrals/redeem')
  async redeemReferral(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RedeemReferralDto,
  ) {
    dto.referredUserId = this.access.selfUser(auth, dto.referredUserId);
    return this.phase5.redeemReferral(dto);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('referrals/evaluate')
  evaluateReferral(@Body() dto: EvaluateReferralDto) {
    return this.phase5.evaluateReferral(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('referrals/users/:userId')
  async referralSummary(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
  ) {
    this.access.selfUser(auth, userId);
    return this.phase5.referralSummary(userId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('verification/profiles')
  async verificationProfile(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpsertVerificationProfileDto,
  ) {
    await this.access.actorIdentity(auth, dto.subjectType, dto.subjectId);
    return this.phase5.upsertVerificationProfile(dto);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Patch('verification/:subjectType/:subjectId/phone')
  verifyPhone(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @Body() dto: VerifyPhoneDto,
  ) {
    return this.phase5.verifyPhone(subjectType, subjectId, dto);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Patch('verification/:subjectType/:subjectId/identity')
  reviewIdentity(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @Body() dto: ReviewIdentityDto,
  ) {
    return this.phase5.reviewIdentity(subjectType, subjectId, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('verification/drivers/:driverId')
  async driverVerification(
    @CurrentAuth() auth: AuthContext,
    @Param('driverId') driverId: string,
  ) {
    await this.access.driverAccess(auth, driverId);
    return this.phase5.driverVerification(driverId);
  }

  @UseGuards(SessionAuthGuard)
  @Get('verification/passengers/:userId')
  async passengerVerification(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
  ) {
    this.access.selfUser(auth, userId);
    return this.phase5.passengerVerification(userId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('vehicle-compliance')
  async vehicleCompliance(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpsertVehicleComplianceDto,
  ) {
    await this.access.vehicleAccess(auth, dto.vehicleId);
    return this.phase5.upsertVehicleCompliance(dto);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Patch('vehicle-compliance/:id/review')
  reviewVehicleCompliance(
    @Param('id') id: string,
    @Body() dto: ReviewVehicleComplianceDto,
  ) {
    return this.phase5.reviewVehicleCompliance(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('trips/:tripId/pin/check')
  async checkPin(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CheckTripPinDto,
  ) {
    await this.access.tripAccess(auth, tripId);
    if (dto.driverId) await this.access.driverAccess(auth, dto.driverId);
    if (dto.passengerUserId) this.access.selfUser(auth, dto.passengerUserId);
    return this.phase5.checkTripPin(tripId, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('trips/:tripId/safety-center')
  async safetyCenter(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    await this.access.tripAccess(auth, tripId);
    return this.phase5.tripSafetyCenter(tripId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides')
  async createSafeRide(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateSafeRideDto,
  ) {
    if (dto.passengerUserId) {
      dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    } else {
      await this.access.driverAccess(auth, dto.driverId);
    }
    return this.phase5.createSafeRide(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/start')
  async startSafeRide(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: StartSafeRideDto,
  ) {
    await this.access.safeRideAccess(auth, id);
    return this.phase5.startSafeRide(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/location')
  async safeRideLocation(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SafeRideLocationDto,
  ) {
    await this.access.safeRideAccess(auth, id);
    return this.phase5.safeRideLocation(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/share')
  async shareSafeRide(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateSafeRideShareDto,
  ) {
    await this.access.safeRideAccess(auth, id);
    return this.phase5.shareSafeRide(id, dto);
  }

  @Get('safe-rides/shared/:token')
  publicSafeRide(@Param('token') token: string) {
    return this.phase5.publicSafeRide(token);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/incidents')
  async safeRideIncident(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateSafeRideIncidentDto,
  ) {
    await this.access.safeRideAccess(auth, id);
    return this.phase5.safeRideIncident(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/complete')
  async completeSafeRide(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.access.safeRideAccess(auth, id);
    return this.phase5.completeSafeRide(id);
  }
}
