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
import { SessionAuthGuard } from '../auth/session-auth.guard';
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
  constructor(private readonly mobilityService: MobilityService) {}

  // CONDUCTORES
  @Post('drivers')
  createDriver(@Body() dto: CreateDriverDto) {
    return this.mobilityService.createDriver(dto);
  }

  @Patch('drivers/:driverId/availability')
  updateDriverAvailability(
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverAvailabilityDto,
  ) {
    return this.mobilityService.updateDriverAvailability(driverId, dto);
  }

  @Get('drivers/nearby')
  nearbyDrivers(
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
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.mobilityService.createVehicle(dto);
  }

  // VIAJES
  @Post('trips')
  createTrip(@Body() dto: CreateTripDto) {
    return this.mobilityService.createTrip(dto);
  }

  @Get('trips')
  listTrips(
    @Query('passengerUserId') passengerUserId?: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
  ) {
    return this.mobilityService.listTrips({
      passengerUserId,
      driverId,
      status,
    });
  }

  @Get('trips/:tripId')
  getTrip(@Param('tripId') tripId: string) {
    return this.mobilityService.getTrip(tripId);
  }

  @Patch('trips/:tripId/location')
  updateTripLocation(
    @Param('tripId') tripId: string,
    @Body() dto: UpdateTripLocationDto,
  ) {
    return this.mobilityService.updateTripLocation(tripId, dto);
  }

  // OFERTAS DE PRECIO
  @Post('trips/:tripId/offers')
  createOffer(@Param('tripId') tripId: string, @Body() dto: CreateOfferDto) {
    return this.mobilityService.createOffer(tripId, dto);
  }

  @Post('trips/:tripId/offers/:offerId/accept')
  acceptOffer(
    @Param('tripId') tripId: string,
    @Param('offerId') offerId: string,
    @Body() dto: AcceptOfferDto,
  ) {
    return this.mobilityService.acceptOffer(tripId, offerId, dto);
  }

  // CICLO DE VIAJE
  @Post('trips/:tripId/arrive')
  arriveTrip(@Param('tripId') tripId: string, @Body() dto: ArriveTripDto) {
    return this.mobilityService.arriveTrip(tripId, dto);
  }

  @Post('trips/:tripId/start')
  startTrip(@Param('tripId') tripId: string, @Body() dto: StartTripDto) {
    return this.mobilityService.startTrip(tripId, dto);
  }

  @Post('trips/:tripId/complete')
  completeTrip(@Param('tripId') tripId: string, @Body() dto: CompleteTripDto) {
    return this.mobilityService.completeTrip(tripId, dto);
  }

  @Post('trips/:tripId/cancel')
  cancelTrip(@Param('tripId') tripId: string, @Body() dto: CancelTripDto) {
    return this.mobilityService.cancelTrip(tripId, dto);
  }
}
