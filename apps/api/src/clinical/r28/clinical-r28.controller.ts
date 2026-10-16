import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ClinicalFeatureGuard } from '../clinical-feature.guard';
import { ClinicalLifeMaterializerService } from './clinical-r28-life-materializer.service';
import { ClinicalR28Service } from './clinical-r28.service';
import {
  CreateClinicalConsultationDto,
  CreateClinicalConsultationLinkDto,
} from './dto/create-consultation.dto';
import {
  CreateClinicalRegimenDto,
  DispenseClinicalRegimenDto,
} from './dto/regimen.dto';
import { CreateConsultationPrescriptionDto } from './dto/professional-prescription.dto';
import { ClinicalAssistantQueryDto } from '../dto/assistant-query.dto';

@Controller('clinical/r28')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalR28Controller {
  constructor(
    private readonly clinical: ClinicalR28Service,
    private readonly life: ClinicalLifeMaterializerService,
  ) {}

  @Get('me/consultations')
  consultations(@CurrentAuth() auth: AuthContext) {
    return this.clinical.listConsultations(auth);
  }

  @Post('me/consultations')
  createConsultation(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateClinicalConsultationDto,
  ) {
    return this.clinical.createConsultation(auth, dto);
  }

  @Post('me/consultations/:id/link')
  createConsultationLink(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateClinicalConsultationLinkDto,
  ) {
    return this.clinical.createConsultationLink(auth, id, dto);
  }

  @Post('me/consultations/:id/revoke-links')
  revokeConsultationLinks(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.revokeConsultationLinks(auth, id);
  }

  @Get('access/consultation')
  accessConsultation(
    @CurrentAuth() auth: AuthContext,
    @Query('token') token: string,
  ) {
    return this.clinical.accessConsultation(auth, token);
  }

  @Get('me/regimens')
  regimens(@CurrentAuth() auth: AuthContext) {
    return this.clinical.listRegimens(auth);
  }

  @Post('me/regimens')
  createRegimen(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateClinicalRegimenDto,
  ) {
    return this.clinical.createRegimen(auth, dto);
  }

  @Post('me/regimens/:id/dispense')
  dispense(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: DispenseClinicalRegimenDto,
  ) {
    return this.clinical.dispense(auth, id, dto);
  }

  @Post('consultations/:id/prescriptions')
  consultationPrescription(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateConsultationPrescriptionDto,
  ) {
    return this.clinical.issueConsultationPrescription(auth, id, dto);
  }

  @Post('me/life/materialize')
  materialize(@CurrentAuth() auth: AuthContext) {
    return this.life.materializeForUser(auth);
  }

  @Post('assistant/query')
  assistant(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ClinicalAssistantQueryDto,
  ) {
    return this.clinical.combinedAssistant(auth, dto.query);
  }
}
