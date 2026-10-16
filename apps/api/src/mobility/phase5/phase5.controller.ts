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
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
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
  constructor(private readonly phase5: MobilityPhase5Service) {}

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('referrals/campaigns')
  createReferralCampaign(@Body() dto: CreateReferralCampaignDto) {
    return this.phase5.createReferralCampaign(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('referrals/codes')
  createReferralCode(@Body() dto: CreateReferralCodeDto) {
    return this.phase5.createReferralCode(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('referrals/redeem')
  redeemReferral(@Body() dto: RedeemReferralDto) {
    return this.phase5.redeemReferral(dto);
  }

  @UseGuards(SessionAuthGuard, PlatformOperatorGuard)
  @Post('referrals/evaluate')
  evaluateReferral(@Body() dto: EvaluateReferralDto) {
    return this.phase5.evaluateReferral(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('referrals/users/:userId')
  referralSummary(@Param('userId') userId: string) {
    return this.phase5.referralSummary(userId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('verification/profiles')
  verificationProfile(@Body() dto: UpsertVerificationProfileDto) {
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
  driverVerification(@Param('driverId') driverId: string) {
    return this.phase5.driverVerification(driverId);
  }

  @UseGuards(SessionAuthGuard)
  @Get('verification/passengers/:userId')
  passengerVerification(@Param('userId') userId: string) {
    return this.phase5.passengerVerification(userId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('vehicle-compliance')
  vehicleCompliance(@Body() dto: UpsertVehicleComplianceDto) {
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
  checkPin(@Param('tripId') tripId: string, @Body() dto: CheckTripPinDto) {
    return this.phase5.checkTripPin(tripId, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Get('trips/:tripId/safety-center')
  safetyCenter(@Param('tripId') tripId: string) {
    return this.phase5.tripSafetyCenter(tripId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides')
  createSafeRide(@Body() dto: CreateSafeRideDto) {
    return this.phase5.createSafeRide(dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/start')
  startSafeRide(@Param('id') id: string, @Body() dto: StartSafeRideDto) {
    return this.phase5.startSafeRide(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/location')
  safeRideLocation(@Param('id') id: string, @Body() dto: SafeRideLocationDto) {
    return this.phase5.safeRideLocation(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/share')
  shareSafeRide(@Param('id') id: string, @Body() dto: CreateSafeRideShareDto) {
    return this.phase5.shareSafeRide(id, dto);
  }

  @Get('safe-rides/shared/:token')
  publicSafeRide(@Param('token') token: string) {
    return this.phase5.publicSafeRide(token);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/incidents')
  safeRideIncident(
    @Param('id') id: string,
    @Body() dto: CreateSafeRideIncidentDto,
  ) {
    return this.phase5.safeRideIncident(id, dto);
  }

  @UseGuards(SessionAuthGuard)
  @Post('safe-rides/:id/complete')
  completeSafeRide(@Param('id') id: string) {
    return this.phase5.completeSafeRide(id);
  }
}
