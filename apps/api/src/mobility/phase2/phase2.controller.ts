import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { MobilityAccessService } from '../mobility-access.service';
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
  constructor(
    private readonly phase2: MobilityPhase2Service,
    private readonly access: MobilityAccessService,
  ) {}
  @Post('trips/:tripId/trace') async addTrace(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: AddLocationTraceDto,
  ) {
    await this.access.tripAccess(auth, tripId);
    await this.access.actorIdentity(auth, dto.actorType, dto.actorId);
    return this.phase2.addLocationTrace(tripId, dto);
  }
  @Get('trips/:tripId/route') async getRoute(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    await this.access.tripAccess(auth, tripId);
    return this.phase2.getTripRoute(tripId);
  }
  @Post('trips/:tripId/cancellation/evaluate') async evaluateCancellation(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: EvaluateCancellationDto,
  ) {
    await this.access.tripAccess(auth, tripId);
    await this.access.actorIdentity(
      auth,
      dto.requestedByType,
      dto.requestedById,
    );
    return this.phase2.evaluateCancellation(tripId, dto);
  }
  @Post('safety/incidents') async triggerSafety(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: TriggerSafetyIncidentDto,
  ) {
    if (dto.tripId) await this.access.tripAccess(auth, dto.tripId);
    if (dto.driverId) await this.access.driverAccess(auth, dto.driverId);
    dto.userId = this.access.selfUser(auth, dto.userId);
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
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateTrustedContactDto,
  ) {
    dto.ownerUserId = this.access.selfUser(auth, dto.ownerUserId);
    return this.phase2.addTrustedContact(dto);
  }
  @Get('trusted-contacts') listTrustedContacts(
    @CurrentAuth() auth: AuthContext,
    @Query('ownerUserId') ownerUserId?: string,
  ) {
    return this.phase2.listTrustedContacts(
      this.access.selfUser(auth, ownerUserId),
    );
  }
  @Post('trackers') async createTracker(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateTrackerDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    if (dto.vehicleId) {
      await this.access.vehicleOfDriver(dto.vehicleId, dto.driverId);
    }
    return this.phase2.createTracker(dto);
  }
  @Post('trackers/:trackerId/ping') async trackerPing(
    @CurrentAuth() auth: AuthContext,
    @Param('trackerId') trackerId: string,
    @Body() dto: TrackerPingDto,
  ) {
    await this.access.trackerAccess(auth, trackerId);
    return this.phase2.trackerPing(trackerId, dto);
  }
  @Post('lost-items') async createLostItem(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateLostItemDto,
  ) {
    const role = await this.access.tripAccess(auth, dto.tripId);
    if (role === 'DRIVER') {
      throw new ForbiddenException(
        'Solo el pasajero puede reportar un objeto olvidado.',
      );
    }
    dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    return this.phase2.createLostItemCase(dto);
  }
  @Post('lost-items/:id/contact-attempt') async lostItemContact(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.access.lostItemAccess(auth, id);
    return this.phase2.registerLostItemContactAttempt(id);
  }
  @Get('rewards/drivers/:driverId') async rewardSummary(
    @CurrentAuth() auth: AuthContext,
    @Param('driverId') driverId: string,
  ) {
    await this.access.driverAccess(auth, driverId);
    return this.phase2.rewardSummary(driverId);
  }
  @UseGuards(PlatformOperatorGuard)
  @Post('rewards/trips/:tripId/apply')
  applyTripReward(@Param('tripId') tripId: string) {
    return this.phase2.applyTripReward(tripId);
  }
  @Post('scheduled-routes') createScheduledRoute(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateScheduledRouteDto,
  ) {
    dto.userId = this.access.selfUser(auth, dto.userId);
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
