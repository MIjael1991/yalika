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
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AuthContext } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MobilityAccessService } from './mobility-access.service';
import { MobilityService } from './mobility.service';
import {
  AcceptOfferDto,
  ArriveTripDto,
  CancelTripDto,
  CompleteTripDto,
  CreateDriverDto,
  CreateOfferDto,
  CreateTripDto,
  CreateVehicleDto,
  StartTripDto,
  UpdateDriverAvailabilityDto,
  UpdateTripLocationDto,
} from './dto';

@Controller('mobility')
@UseGuards(SessionAuthGuard)
export class MobilityController {
  constructor(
    private readonly mobilityService: MobilityService,
    private readonly access: MobilityAccessService,
  ) {}

  // CONDUCTORES
  @Post('drivers')
  async createDriver(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateDriverDto,
  ) {
    dto.userId = this.access.selfUser(auth, dto.userId);
    return this.mobilityService.createDriver(dto);
  }

  @Patch('drivers/:driverId/availability')
  async updateDriverAvailability(
    @CurrentAuth() auth: AuthContext,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverAvailabilityDto,
  ) {
    await this.access.driverAccess(auth, driverId);
    return this.mobilityService.updateDriverAvailability(driverId, dto);
  }

  @Get('drivers/nearby')
  async nearbyDrivers(
    @CurrentAuth() auth: AuthContext,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusKm') radiusKm = '5',
  ) {
    return this.mobilityService.findNearbyDrivers(
      Number(lat),
      Number(lng),
      Number(radiusKm),
    );
  }

  // VEHÍCULOS
  @Post('vehicles')
  async createVehicle(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateVehicleDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.mobilityService.createVehicle(dto);
  }

  // VIAJES
  @Post('trips')
  async createTrip(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateTripDto,
  ) {
    dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    return this.mobilityService.createTrip(dto);
  }

  @Get('trips')
  async listTrips(
    @CurrentAuth() auth: AuthContext,
    @Query('passengerUserId') passengerUserId?: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
  ) {
    const operator = this.access.isOperator(auth);
    if (driverId) await this.access.driverAccess(auth, driverId);
    const ownPassenger = this.access.selfUser(auth, passengerUserId);
    const trips = await this.mobilityService.listTrips({
      passengerUserId: driverId && !passengerUserId ? undefined : ownPassenger,
      driverId,
      status,
    });
    return trips.map((trip) =>
      this.access.hidePin(
        trip,
        trip.passengerUserId === auth.user.id || operator
          ? 'PASSENGER'
          : 'DRIVER',
      ),
    );
  }

  @Get('trips/:tripId')
  async getTrip(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    const role = await this.access.tripView(auth, tripId);
    return this.access.hidePin(
      await this.mobilityService.getTrip(tripId),
      role,
    );
  }

  @Patch('trips/:tripId/location')
  async updateTripLocation(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: UpdateTripLocationDto,
  ) {
    await this.access.tripAccess(auth, tripId);
    await this.access.actorIdentity(auth, dto.actorType, dto.actorId);
    return this.mobilityService.updateTripLocation(tripId, dto);
  }

  // OFERTAS DE PRECIO
  @Post('trips/:tripId/offers')
  async createOffer(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CreateOfferDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.mobilityService.createOffer(tripId, dto);
  }

  @Post('trips/:tripId/offers/:offerId/accept')
  async acceptOffer(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('offerId') offerId: string,
    @Body() dto: AcceptOfferDto,
  ) {
    dto.passengerUserId = this.access.selfUser(auth, dto.passengerUserId);
    return this.mobilityService.acceptOffer(tripId, offerId, dto);
  }

  // CICLO DE VIAJE
  @Post('trips/:tripId/arrive')
  async arriveTrip(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: ArriveTripDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.mobilityService.arriveTrip(tripId, dto);
  }

  @Post('trips/:tripId/start')
  async startTrip(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: StartTripDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.mobilityService.startTrip(tripId, dto);
  }

  @Post('trips/:tripId/complete')
  async completeTrip(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CompleteTripDto,
  ) {
    await this.access.driverAccess(auth, dto.driverId);
    return this.mobilityService.completeTrip(tripId, dto);
  }

  @Post('trips/:tripId/cancel')
  async cancelTrip(
    @CurrentAuth() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body() dto: CancelTripDto,
  ) {
    await this.access.tripAccess(auth, tripId);
    await this.access.actorIdentity(auth, dto.actorType, dto.actorId);
    return this.mobilityService.cancelTrip(tripId, dto);
  }
}
