import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { AddSiteMemberDto, UpdateSiteMemberDto } from './site-team.dto';
import { SiteTeamService } from './site-team.service';

@Controller('site-team')
export class SiteTeamController {
  constructor(private readonly siteTeamService: SiteTeamService) {}

  @Get('site/:siteId')
  list(@Param('siteId') siteId: string, @CurrentAuth() auth: AuthContext) {
    return this.siteTeamService.list(siteId, auth.user.id, auth.user.companyId);
  }

  @Post('site/:siteId/members')
  add(
    @Param('siteId') siteId: string,
    @Body() dto: AddSiteMemberDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteTeamService.add(
      siteId,
      dto,
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Patch('site/:siteId/members/:memberId')
  update(
    @Param('siteId') siteId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateSiteMemberDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteTeamService.update(
      siteId,
      memberId,
      dto,
      auth.user.id,
      auth.user.companyId,
    );
  }
}
