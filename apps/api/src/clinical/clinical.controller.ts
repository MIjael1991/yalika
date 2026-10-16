import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ClinicalFeatureGuard } from './clinical-feature.guard';
import { ClinicalService } from './clinical.service';
import { CLINICAL_MAX_UPLOAD_BYTES } from './clinical.constants';
import { safeDownloadName } from './clinical.utils';
import { ClinicalAssistantQueryDto } from './dto/assistant-query.dto';
import { CreateClinicalEventDto } from './dto/create-clinical-event.dto';
import { CreatePatientPrescriptionDto } from './dto/create-prescription.dto';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { RequestClinicalAccessDto } from './dto/request-access.dto';

@Controller('clinical')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Post('me/demo/seed')
  seedDemo(@CurrentAuth() auth: AuthContext) {
    return this.clinical.seedDemo(auth.user.id);
  }

  @Get('me/dashboard')
  dashboard(@CurrentAuth() auth: AuthContext) {
    return this.clinical.dashboard(auth.user.id);
  }

  @Get('me/timeline')
  timeline(
    @CurrentAuth() auth: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kind') kind?: string,
  ) {
    return this.clinical.timeline(auth.user.id, { from, to, kind });
  }

  @Get('me/calendar')
  calendar(
    @CurrentAuth() auth: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.clinical.timeline(auth.user.id, { from, to });
  }

  @Post('me/events')
  createEvent(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateClinicalEventDto,
  ) {
    return this.clinical.createEvent(auth.user.id, dto);
  }

  @Get('me/documents')
  documents(@CurrentAuth() auth: AuthContext) {
    return this.clinical.listDocuments(auth.user.id);
  }

  @Post('me/documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CLINICAL_MAX_UPLOAD_BYTES },
    }),
  )
  uploadDocument(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname: string;
          mimetype: string;
          size: number;
        }
      | undefined,
    @Body('title') title: string,
    @Body('documentType') documentType: string,
    @Body('clinicalDate') clinicalDate?: string,
  ) {
    return this.clinical.uploadDocument(auth.user.id, {
      file,
      title,
      documentType,
      clinicalDate,
    });
  }

  @Get('me/documents/:id/download')
  async ownDocument(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.clinical.ownDocument(auth.user.id, id);
    response.setHeader('Content-Type', result.document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDownloadName(result.document.originalName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(result.content);
  }

  @Get('me/prescriptions')
  prescriptions(@CurrentAuth() auth: AuthContext) {
    return this.clinical.listPrescriptions(auth.user.id);
  }

  @Post('me/prescriptions')
  createPrescription(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreatePatientPrescriptionDto,
  ) {
    return this.clinical.createPatientPrescription(auth.user.id, dto);
  }

  @Post('me/share-links')
  createShareLink(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.clinical.createShareLink(auth.user.id, dto);
  }

  @Get('me/share-links')
  ownerShareLinks(@CurrentAuth() auth: AuthContext) {
    return this.clinical.ownerShareLinks(auth.user.id);
  }

  @Post('me/share-links/:id/revoke')
  revokeShareLink(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.revokeShareLink(auth.user.id, id);
  }

  @Get('me/access-requests')
  incomingRequests(@CurrentAuth() auth: AuthContext) {
    return this.clinical.incomingRequests(auth.user.id);
  }

  @Post('me/access-requests/:id/deny')
  denyRequest(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.denyRequest(auth.user.id, id);
  }

  @Post('me/access-requests/:id/approve')
  approveRequest(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.approveRequest(auth.user.id, id);
  }

  @Get('me/access-grants')
  ownerGrants(@CurrentAuth() auth: AuthContext) {
    return this.clinical.ownerGrants(auth.user.id);
  }

  @Post('me/access-grants/:id/revoke')
  revokeGrant(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.revokeGrant(auth.user.id, id);
  }

  @Get('me/audit')
  audit(@CurrentAuth() auth: AuthContext) {
    return this.clinical.auditLog(auth.user.id);
  }

  @Post('access/request')
  requestAccess(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RequestClinicalAccessDto,
  ) {
    return this.clinical.requestAccess(auth.user.id, dto.token);
  }

  @Get('access/grants')
  viewerGrants(@CurrentAuth() auth: AuthContext) {
    return this.clinical.viewerGrants(auth.user.id);
  }

  @Post('access/grants/:id/session')
  createAccessSession(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.createAccessSession(auth.user.id, id);
  }

  @Get('access/sessions/:id/documents')
  sharedDocuments(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clinical.sharedDocuments(auth.user.id, id);
  }

  @Get('access/sessions/:id/documents/:documentId/download')
  async sharedDownload(
    @CurrentAuth() auth: AuthContext,
    @Param('id') sessionId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.clinical.sharedDocumentDownload(
      auth.user.id,
      sessionId,
      documentId,
    );
    response.setHeader('Content-Type', result.document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDownloadName(result.document.originalName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(result.content);
  }

  @Post('assistant/query')
  assistant(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ClinicalAssistantQueryDto,
  ) {
    return this.clinical.assistant(auth.user.id, dto.query);
  }
}
