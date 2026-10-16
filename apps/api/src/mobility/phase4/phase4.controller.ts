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
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
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
  constructor(private readonly phase4: MobilityPhase4Service) {}

  @Post('trips/:tripId/ratings')
  createRating(@Param('tripId') tripId: string, @Body() dto: CreateRatingDto) {
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
  createSupport(@Body() dto: CreateSupportCaseDto) {
    return this.phase4.createSupportCase(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Patch('support/cases/:id/resolve')
  resolveSupport(@Param('id') id: string, @Body() dto: ResolveSupportCaseDto) {
    return this.phase4.resolveSupportCase(id, dto);
  }

  @Post('driver-documents')
  createDocument(@Body() dto: CreateDriverDocumentDto) {
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
  receipt(@Param('tripId') tripId: string) {
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

  @Get('trips/:tripId/audit')
  auditTrail(@Param('tripId') tripId: string) {
    return this.phase4.auditTrail(tripId);
  }
}
