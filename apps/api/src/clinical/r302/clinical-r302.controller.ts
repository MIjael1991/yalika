import {
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ClinicalFeatureGuard } from '../clinical-feature.guard';
import { CLINICAL_MAX_UPLOAD_BYTES } from '../clinical.constants';
import { ClinicalR302NetworkService } from './clinical-r302-network.service';
import {
  CaptureOrganizationLocationDto,
  CreateNetworkOrganizationDto,
  InviteNetworkProfessionalDto,
} from './dto/r302.dto';

@Controller('clinical/r302/network')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalR302Controller {
  constructor(private readonly network: ClinicalR302NetworkService) {}

  @Get('me')
  me(@CurrentAuth() auth: any) {
    return this.network.me(auth);
  }

  @Post('organizations')
  createOrganization(
    @CurrentAuth() auth: any,
    @Body() dto: CreateNetworkOrganizationDto,
  ) {
    return this.network.createOrganization(auth, dto);
  }

  @Post('organizations/:id/location')
  saveLocation(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @Body() dto: CaptureOrganizationLocationDto,
  ) {
    return this.network.saveLocation(auth, id, dto);
  }

  @Post('organizations/:id/evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CLINICAL_MAX_UPLOAD_BYTES } }))
  uploadEvidence(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @UploadedFile()
    file:
      | { buffer: Buffer; originalname: string; mimetype: string; size: number }
      | undefined,
    @Body('kind') kind: string,
    @Body('note') note?: string,
  ) {
    return this.network.uploadEvidence(auth, id, kind, note, file);
  }

  @Post('organizations/:organizationId/evidence/:evidenceId/remove')
  removeEvidence(
    @CurrentAuth() auth: any,
    @Param('organizationId') organizationId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.network.removeEvidence(auth, organizationId, evidenceId);
  }

  @Post('organizations/:id/submit')
  submitForReview(@CurrentAuth() auth: any, @Param('id') id: string) {
    return this.network.submitForReview(auth, id);
  }

  @Post('organizations/:id/invitations')
  inviteProfessional(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @Body() dto: InviteNetworkProfessionalDto,
  ) {
    return this.network.inviteProfessional(auth, id, dto);
  }

  @Post('invitations/:id/accept')
  acceptInvitation(@CurrentAuth() auth: any, @Param('id') id: string) {
    return this.network.acceptInvitation(auth, id);
  }
}
