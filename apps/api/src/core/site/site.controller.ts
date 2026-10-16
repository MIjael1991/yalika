import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpdateSiteSectionsDto } from './dto/update-site-sections.dto';
import { SiteService } from './site.service';

@Controller('site')
export class SiteController {
  constructor(private readonly siteService: SiteService) {}

  @Post()
  create(@Body() dto: CreateSiteDto, @CurrentAuth() auth: AuthContext) {
    return this.siteService.create(dto, auth.user.id, auth.user.companyId);
  }

  @Get('company/:companyId/all')
  findAllByCompany(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteService.findAllByCompany(
      companyId,
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Get('company/:companyId/site/:siteId')
  findOneByCompany(
    @Param('companyId') companyId: string,
    @Param('siteId') siteId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteService.findOneByCompany(
      companyId,
      siteId,
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteService.findByCompany(
      companyId,
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Get('public/:slug')
  findPublic(@Param('slug') slug: string) {
    return this.siteService.findPublic(slug);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @Headers('x-yalika-confirm-live-update') confirmation: string | undefined,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteService.update(
      id,
      dto,
      confirmation === 'yes',
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Patch(':id/sections')
  updateSections(
    @Param('id') id: string,
    @Body() dto: UpdateSiteSectionsDto,
    @Headers('x-yalika-confirm-live-update') confirmation: string | undefined,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.siteService.replaceSections(
      id,
      dto,
      confirmation === 'yes',
      auth.user.id,
      auth.user.companyId,
    );
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.siteService.publish(id, auth.user.id, auth.user.companyId);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.siteService.unpublish(id, auth.user.id, auth.user.companyId);
  }

  @Post(':id/primary')
  setPrimary(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.siteService.setPrimary(id, auth.user.id, auth.user.companyId);
  }
}
