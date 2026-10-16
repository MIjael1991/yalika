import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ConfigureScratchDto } from './dto/configure-scratch.dto';
import { PlayScratchDto } from './dto/play-scratch.dto';
import { RedeemScratchDto } from './dto/redeem-scratch.dto';
import { ScratchService } from './scratch.service';

@Controller('scratch')
export class ScratchController {
  constructor(private readonly scratchService: ScratchService) {}

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.scratchService.findByCompany(companyId);
  }

  @Post('company/:companyId/configure')
  configure(
    @Param('companyId') companyId: string,
    @Body() dto: ConfigureScratchDto,
  ) {
    return this.scratchService.configure(companyId, dto);
  }

  @Post('company/:companyId/redeem')
  redeem(@Param('companyId') companyId: string, @Body() dto: RedeemScratchDto) {
    return this.scratchService.redeem(companyId, dto);
  }

  @Post('public/:slug/play')
  play(@Param('slug') slug: string, @Body() dto: PlayScratchDto) {
    return this.scratchService.play(slug, dto);
  }
}
