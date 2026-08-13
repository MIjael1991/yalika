import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateSiteDto } from './dto/create-site.dto';
import { SiteService } from './site.service';

@Controller('site')
export class SiteController {
  constructor(
    private readonly siteService: SiteService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateSiteDto,
  ) {
    return this.siteService.create(dto);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.siteService.findByCompany(
      companyId,
    );
  }

  @Get('public/:slug')
  findPublic(
    @Param('slug') slug: string,
  ) {
    return this.siteService.findPublic(slug);
  }

  @Post(':id/publish')
  publish(
    @Param('id') id: string,
  ) {
    return this.siteService.publish(id);
  }
}