import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { JoinClubDto } from './dto/join-club.dto';
import { ClaimTicketDto } from './dto/claim-ticket.dto';
import { IdentifyCustomerDto } from './dto/identify-customer.dto';
import { EngagementService } from './engagement.service';

@Controller('engagement')
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  @Get('public/:slug')
  findClub(@Param('slug') slug: string) {
    return this.engagementService.findClub(slug);
  }

  @Post('public/:slug/join')
  join(@Param('slug') slug: string, @Body() dto: JoinClubDto) {
    return this.engagementService.join(slug, dto);
  }

  @Post('public/:slug/check-in')
  checkIn(@Param('slug') slug: string, @Body() dto: JoinClubDto) {
    return this.engagementService.checkIn(slug, dto);
  }

  @Post('public/:slug/claim-ticket')
  claimTicket(@Param('slug') slug: string, @Body() dto: ClaimTicketDto) {
    return this.engagementService.claimTicket(slug, dto);
  }

  @Post('company/:companyId/identify')
  identifyCustomer(
    @Param('companyId') companyId: string,
    @Body() dto: IdentifyCustomerDto,
  ) {
    return this.engagementService.identifyCustomer(companyId, dto);
  }
}
