import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ClinicalFeatureGuard } from '../clinical-feature.guard';
import { ClinicalR29Service } from './clinical-r29.service';
import {
  ChangeMedicationScheduleDto,
  ConfirmVisitCaptureDto,
  CreateAllergyDto,
  CreateCaregiverGrantDto,
  CreateFollowUpProposalDto,
  CreateHealthQrDto,
  CreateMedicationScheduleDto,
  CreateProcedureDto,
  CreateRestrictionDto,
  CreateVisitCaptureDto,
  DoctorSummaryDto,
  RecordMedicationDoseDto,
  SyncBatchDto,
} from './dto/r29.dto';
import { ClinicalAssistantQueryDto } from '../dto/assistant-query.dto';

@Controller('clinical/r29')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalR29Controller {
  constructor(private readonly clinical: ClinicalR29Service) {}

  @Get('me/overview')
  overview(@CurrentAuth() auth: AuthContext) {
    return this.clinical.overview(auth);
  }

  @Post('me/visit-captures')
  createCapture(@CurrentAuth() auth: AuthContext, @Body() dto: CreateVisitCaptureDto) {
    return this.clinical.createCapture(auth, dto);
  }

  @Post('me/visit-captures/:id/confirm')
  confirmCapture(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ConfirmVisitCaptureDto,
  ) {
    return this.clinical.confirmCapture(auth, id, dto);
  }

  @Post('me/allergies')
  createAllergy(@CurrentAuth() auth: AuthContext, @Body() dto: CreateAllergyDto) {
    return this.clinical.createAllergy(auth, dto);
  }

  @Post('me/allergies/:id/deactivate')
  deactivateAllergy(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clinical.deactivateAllergy(auth, id);
  }

  @Post('me/restrictions')
  createRestriction(@CurrentAuth() auth: AuthContext, @Body() dto: CreateRestrictionDto) {
    return this.clinical.createRestriction(auth, dto);
  }

  @Post('me/restrictions/:id/deactivate')
  deactivateRestriction(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clinical.deactivateRestriction(auth, id);
  }

  @Post('me/medication-schedules')
  createMedicationSchedule(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateMedicationScheduleDto,
  ) {
    return this.clinical.createMedicationSchedule(auth, dto);
  }

  @Post('me/medication-schedules/:id/doses')
  recordMedicationDose(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: RecordMedicationDoseDto,
  ) {
    return this.clinical.recordMedicationDose(auth, id, dto);
  }

  @Post('me/medication-schedules/:id/status')
  changeMedicationSchedule(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ChangeMedicationScheduleDto,
  ) {
    return this.clinical.changeMedicationSchedule(auth, id, dto);
  }

  @Post('me/procedures')
  createProcedure(@CurrentAuth() auth: AuthContext, @Body() dto: CreateProcedureDto) {
    return this.clinical.createProcedure(auth, dto);
  }

  @Post('me/follow-up-proposals')
  createFollowUpProposal(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateFollowUpProposalDto,
  ) {
    return this.clinical.createFollowUpProposal(auth, dto);
  }

  @Post('me/follow-up-proposals/:id/accept')
  acceptFollowUp(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clinical.decideFollowUp(auth, id, true);
  }

  @Post('me/follow-up-proposals/:id/reject')
  rejectFollowUp(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clinical.decideFollowUp(auth, id, false);
  }

  @Post('me/doctor-summary')
  doctorSummary(@CurrentAuth() auth: AuthContext, @Body() dto: DoctorSummaryDto) {
    return this.clinical.doctorSummary(auth, dto);
  }

  @Post('me/health-qr')
  createHealthQr(@CurrentAuth() auth: AuthContext, @Body() dto: CreateHealthQrDto) {
    return this.clinical.createHealthQr(auth, dto);
  }

  @Post('me/caregivers')
  createCaregiverGrant(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateCaregiverGrantDto,
  ) {
    return this.clinical.createCaregiverGrant(auth, dto);
  }

  @Get('access/requests/:id/grant')
  grantForRequest(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clinical.grantForAccessRequest(auth, id);
  }

  @Get('shared/summary')
  sharedSummary(@CurrentAuth() auth: AuthContext, @Query('sessionId') sessionId: string) {
    return this.clinical.sharedHealthSummary(auth, sessionId);
  }

  @Post('assistant/query')
  assistant(@CurrentAuth() auth: AuthContext, @Body() dto: ClinicalAssistantQueryDto) {
    return this.clinical.assistant(auth, dto.query);
  }

  @Post('me/sync')
  sync(@CurrentAuth() auth: AuthContext, @Body() dto: SyncBatchDto) {
    return this.clinical.sync(auth, dto);
  }
}
