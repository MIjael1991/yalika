import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityPhase2Service } from './phase2.service';
import {
  AddLocationTraceDto,
  CreateLostItemDto,
  CreateScheduledRouteDto,
  CreateTrackerDto,
  CreateTrustedContactDto,
  EvaluateCancellationDto,
  ResolveSafetyIncidentDto,
  TrackerPingDto,
  TriggerSafetyIncidentDto,
} from './phase2.dto';

@Controller('mobility')
@UseGuards(SessionAuthGuard)
export class MobilityPhase2Controller {
  constructor(private readonly phase2: MobilityPhase2Service) {}
  @Post('trips/:tripId/trace') addTrace(
    @Param('tripId') tripId: string,
    @Body() dto: AddLocationTraceDto,
  ) {
    return this.phase2.addLocationTrace(tripId, dto);
  }
  @Get('trips/:tripId/route') getRoute(@Param('tripId') tripId: string) {
    return this.phase2.getTripRoute(tripId);
  }
  @Post('trips/:tripId/cancellation/evaluate') evaluateCancellation(
    @Param('tripId') tripId: string,
    @Body() dto: EvaluateCancellationDto,
  ) {
    return this.phase2.evaluateCancellation(tripId, dto);
  }
  @Post('safety/incidents') triggerSafety(
    @Body() dto: TriggerSafetyIncidentDto,
  ) {
    return this.phase2.triggerSafetyIncident(dto);
  }
  @UseGuards(PlatformOperatorGuard)
  @Get('safety/incidents/open')
  listOpenSafety() {
    return this.phase2.listOpenSafetyIncidents();
  }
  @UseGuards(PlatformOperatorGuard)
  @Patch('safety/incidents/:id/resolve')
  resolveSafety(
    @Param('id') id: string,
    @Body() dto: ResolveSafetyIncidentDto,
  ) {
    return this.phase2.resolveSafetyIncident(id, dto);
  }
  @Post('trusted-contacts') addTrustedContact(
    @Body() dto: CreateTrustedContactDto,
  ) {
    return this.phase2.addTrustedContact(dto);
  }
  @Get('trusted-contacts') listTrustedContacts(
    @Query('ownerUserId') ownerUserId: string,
  ) {
    return this.phase2.listTrustedContacts(ownerUserId);
  }
  @Post('trackers') createTracker(@Body() dto: CreateTrackerDto) {
    return this.phase2.createTracker(dto);
  }
  @Post('trackers/:trackerId/ping') trackerPing(
    @Param('trackerId') trackerId: string,
    @Body() dto: TrackerPingDto,
  ) {
    return this.phase2.trackerPing(trackerId, dto);
  }
  @Post('lost-items') createLostItem(@Body() dto: CreateLostItemDto) {
    return this.phase2.createLostItemCase(dto);
  }
  @Post('lost-items/:id/contact-attempt') lostItemContact(
    @Param('id') id: string,
  ) {
    return this.phase2.registerLostItemContactAttempt(id);
  }
  @Get('rewards/drivers/:driverId') rewardSummary(
    @Param('driverId') driverId: string,
  ) {
    return this.phase2.rewardSummary(driverId);
  }
  @UseGuards(PlatformOperatorGuard)
  @Post('rewards/trips/:tripId/apply')
  applyTripReward(@Param('tripId') tripId: string) {
    return this.phase2.applyTripReward(tripId);
  }
  @Post('scheduled-routes') createScheduledRoute(
    @Body() dto: CreateScheduledRouteDto,
  ) {
    return this.phase2.createScheduledRoute(dto);
  }
  @Get('scheduled-routes/match') findScheduledRoutes(
    @Query('originLat') originLat: string,
    @Query('originLng') originLng: string,
    @Query('destinationLat') destinationLat: string,
    @Query('destinationLng') destinationLng: string,
    @Query('radiusKm') radiusKm = '3',
  ) {
    return this.phase2.findScheduledRoutes(
      Number(originLat),
      Number(originLng),
      Number(destinationLat),
      Number(destinationLng),
      Number(radiusKm),
    );
  }
}
