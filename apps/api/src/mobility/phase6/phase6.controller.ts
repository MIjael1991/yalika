import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityPhase6Service } from './phase6.service';
import {
  AcceptProposalDto,
  CandidateSearchDto,
  CreateNegotiationDto,
  CreateNegotiationPolicyDto,
  DriverAcceptDto,
  DriverCounterDto,
  PassengerOfferDto,
  RouteEstimateDto,
} from './phase6.dto';

@Controller('mobility')
@UseGuards(SessionAuthGuard)
export class MobilityPhase6Controller {
  constructor(private readonly phase6: MobilityPhase6Service) {}

  @Post('maps/estimate')
  routeEstimate(@Body() dto: RouteEstimateDto) {
    return this.phase6.estimateRoute(dto);
  }

  @UseGuards(PlatformOperatorGuard)
  @Post('negotiation-policies')
  createPolicy(@Body() dto: CreateNegotiationPolicyDto) {
    return this.phase6.createPolicy(dto);
  }

  @Get('negotiation-policies/active')
  activePolicy(@Query('city') city?: string) {
    return this.phase6.activePolicy(city);
  }

  @Post('negotiations')
  createNegotiation(@Body() dto: CreateNegotiationDto) {
    return this.phase6.createNegotiation(dto);
  }

  @Get('negotiations/:id')
  getNegotiation(@Param('id') id: string) {
    return this.phase6.getNegotiation(id);
  }

  @Get('negotiations/:id/recommendation')
  recommendation(@Param('id') id: string) {
    return this.phase6.recommendation(id);
  }

  @Post('negotiations/:id/passenger-offers')
  passengerOffer(@Param('id') id: string, @Body() dto: PassengerOfferDto) {
    return this.phase6.passengerOffer(id, dto);
  }

  @Post('negotiations/:id/driver-counters')
  driverCounter(@Param('id') id: string, @Body() dto: DriverCounterDto) {
    return this.phase6.driverCounter(id, dto);
  }

  @Post('negotiations/:id/candidates')
  candidates(@Param('id') id: string, @Body() dto: CandidateSearchDto) {
    return this.phase6.candidates(id, dto);
  }

  @Post('negotiations/:id/driver-accept')
  driverAccept(@Param('id') id: string, @Body() dto: DriverAcceptDto) {
    return this.phase6.driverAccept(id, dto);
  }

  @Post('negotiations/:id/proposals/:proposalId/accept')
  acceptProposal(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: AcceptProposalDto,
  ) {
    return this.phase6.acceptProposal(id, proposalId, dto);
  }
}
