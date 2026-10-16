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
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityAccessService } from '../mobility-access.service';
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
  constructor(
    private readonly phase6: MobilityPhase6Service,
    private readonly access: MobilityAccessService,
  ) {}

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
  async createNegotiation(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateNegotiationDto,
  ) {
    dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    return this.phase6.createNegotiation(dto);
  }

  @Get('negotiations/:id')
  async getNegotiation(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.access.negotiationVisible(auth, id);
    return this.phase6.getNegotiation(id);
  }

  @Get('negotiations/:id/recommendation')
  async recommendation(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.access.negotiationVisible(auth, id);
    return this.phase6.recommendation(id);
  }

  @Post('negotiations/:id/passenger-offers')
  async passengerOffer(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PassengerOfferDto,
  ) {
    dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    return this.phase6.passengerOffer(id, dto);
  }

  @Post('negotiations/:id/driver-counters')
  async driverCounter(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: DriverCounterDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.phase6.driverCounter(id, dto);
  }

  @Post('negotiations/:id/candidates')
  async candidates(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CandidateSearchDto,
  ) {
    await this.access.negotiationOwner(auth, id);
    return this.phase6.candidates(id, dto);
  }

  @Post('negotiations/:id/driver-accept')
  async driverAccept(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: DriverAcceptDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.phase6.driverAccept(id, dto);
  }

  @Post('negotiations/:id/proposals/:proposalId/accept')
  async acceptProposal(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: AcceptProposalDto,
  ) {
    dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    return this.phase6.acceptProposal(id, proposalId, dto);
  }
}
