import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityAccessService } from '../mobility-access.service';
import { MobilityPhase4Service } from './phase4.service';
import {
  CreateDriverDocumentDto,
  CreatePayoutDto,
  CreatePrivacyPolicyDto,
  CreateRatingDto,
  CreateSupportCaseDto,
  EscalateSafetyDto,
  MarkNotificationDto,
  PrivacyCleanupDto,
  QueueNotificationDto,
  ResolveSupportCaseDto,
  ReviewDriverDocumentDto,
  SettleCancellationDto,
} from './phase4.dto';

@Controller('mobility')
@UseGuards(SessionAuthGuard)
export class MobilityPhase4Controller {
  constructor(
    private readonly phase4: MobilityPhase4Service,
    private readonly access: MobilityAccessService,
  ) {}

  @Post('trips/:tripId/ratings')
  async createRating(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateRatingDto,
  ) {
    await this.access.ratingParticipants(auth, tripId, dto);
    return this.phase4.createRating(tripId, dto);
  }

  @Get('ratings/summary')
  ratingSummary(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
  ) {
    return this.phase4.ratingSummary(targetType, targetId);
  }

  @Post('support/cases')
  async createSupport(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateSupportCaseDto,
  ) {
    if (dto.tripId) await this.access.tripAccess(auth, dto.tripId);
    if (dto.driverId) await this.access.driverAccess(auth, dto.driverId);
    dto.userId = this.access.selfUser(auth, dto.userId);
    return this.phase4.createSupportCase(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Patch('support/cases/:id/resolve')
  resolveSupport(@Param('id') id: string, @Body() dto: ResolveSupportCaseDto) {
    return this.phase4.resolveSupportCase(id, dto);
  }

  @Post('driver-documents')
  async createDocument(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateDriverDocumentDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.phase4.createDriverDocument(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Patch('driver-documents/:id/review')
  reviewDocument(
    @Param('id') id: string,
    @Body() dto: ReviewDriverDocumentDto,
  ) {
    return this.phase4.reviewDriverDocument(id, dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Get('driver-documents/expiring')
  expiringDocuments(@Query('days') days = '30') {
    return this.phase4.expiringDocuments(Number(days));
  }

  @Post('trips/:tripId/receipt')
  async receipt(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    await this.access.tripAccess(auth, tripId);
    return this.phase4.issueReceipt(tripId);
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('trips/:tripId/cancellation/settle')
  settleCancellation(
    @Param('tripId') tripId: string,
    @Body() dto: SettleCancellationDto,
  ) {
    return this.phase4.settleCancellation(tripId, dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('notifications/outbox')
  queueNotification(@Body() dto: QueueNotificationDto) {
    return this.phase4.queueNotification(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Get('notifications/outbox/pending')
  pendingNotifications(@Query('limit') limit = '50') {
    return this.phase4.pendingNotifications(Number(limit));
  }

  @UseGuards(PlatformOperatorGuard)
  @Patch('notifications/outbox/:id')
  markNotification(@Param('id') id: string, @Body() dto: MarkNotificationDto) {
    return this.phase4.markNotification(id, dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('safety/incidents/:incidentId/escalations')
  escalateSafety(
    @Param('incidentId') incidentId: string,
    @Body() dto: EscalateSafetyDto,
  ) {
    return this.phase4.escalateSafety(incidentId, dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('privacy/policies')
  createPrivacyPolicy(@Body() dto: CreatePrivacyPolicyDto) {
    return this.phase4.createPrivacyPolicy(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Get('privacy/cleanup/preview')
  cleanupPreview() {
    return this.phase4.privacyCleanupPreview();
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('privacy/cleanup')
  cleanup(@Body() dto: PrivacyCleanupDto) {
    return this.phase4.privacyCleanup(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('payouts')
  createPayout(@Body() dto: CreatePayoutDto) {
    return this.phase4.createPayout(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Get('trips/:tripId/audit')
  auditTrail(@Param('tripId') tripId: string) {
    return this.phase4.auditTrail(tripId);
  }
}
