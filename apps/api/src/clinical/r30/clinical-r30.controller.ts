import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ClinicalFeatureGuard } from '../clinical-feature.guard';

import { ClinicalR30TrustService } from './clinical-r30-trust.service';
import {
  CreateCareOrganizationDto,
  EndProfessionalMembershipDto,
  InviteProfessionalDto,
  UpdateCareOrganizationDto,
  UpsertProfessionalProfileDto,
  VerifyOrganizationDto,
  VerifyProfessionalDto,
} from './dto/r30.dto';

@Controller('clinical/r30/trust')
@UseGuards(SessionAuthGuard, ClinicalFeatureGuard)
export class ClinicalR30Controller {
  constructor(private readonly trust: ClinicalR30TrustService) {}

  @Get('me')
  me(@CurrentAuth() auth: any) {
    return this.trust.me(auth);
  }

  @Post('professional/profile')
  upsertProfessionalProfile(
    @CurrentAuth() auth: any,
    @Body() dto: UpsertProfessionalProfileDto,
  ) {
    return this.trust.upsertProfessionalProfile(auth, dto);
  }

  @Post('organizations')
  createOrganization(
    @CurrentAuth() auth: any,
    @Body() dto: CreateCareOrganizationDto,
  ) {
    return this.trust.createOrganization(auth, dto);
  }

  @Patch('organizations/:id')
  updateOrganization(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @Body() dto: UpdateCareOrganizationDto,
  ) {
    return this.trust.updateOrganization(auth, id, dto);
  }

  @Get('organizations/:id/team')
  organizationTeam(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
  ) {
    return this.trust.organizationTeam(auth, id);
  }

  @Post('organizations/:id/professionals/invite')
  inviteProfessional(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @Body() dto: InviteProfessionalDto,
  ) {
    return this.trust.inviteProfessional(auth, id, dto);
  }

  @Post('memberships/:id/accept')
  acceptMembership(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
  ) {
    return this.trust.acceptMembership(auth, id);
  }

  @Post('organizations/:organizationId/memberships/:membershipId/end')
  endMembership(
    @CurrentAuth() auth: any,
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: EndProfessionalMembershipDto,
  ) {
    return this.trust.endMembership(
      auth,
      organizationId,
      membershipId,
      dto,
    );
  }

  @Get('admin/pending')
  adminPending(@CurrentAuth() auth: any) {
    return this.trust.adminPending(auth);
  }

  @Post('admin/professionals/:id/verify')
  verifyProfessional(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @Body() dto: VerifyProfessionalDto,
  ) {
    return this.trust.verifyProfessional(auth, id, dto);
  }

  @Post('admin/organizations/:id/verify')
  verifyOrganization(
    @CurrentAuth() auth: any,
    @Param('id') id: string,
    @Body() dto: VerifyOrganizationDto,
  ) {
    return this.trust.verifyOrganization(auth, id, dto);
  }
}
