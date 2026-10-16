import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class MobilityPhase2Service {
  constructor(private readonly prisma: PrismaService) {}

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async addLocationTrace(tripId: string, dto: AddLocationTraceDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    const point = await this.prisma.mobilityLocationTrace.create({
      data: {
        tripId,
        actorType: dto.actorType,
        actorId: dto.actorId,
        source: dto.source ?? 'PHONE',
        lat: dto.lat,
        lng: dto.lng,
        accuracyMeters: dto.accuracyMeters,
        speedKmh: dto.speedKmh,
        batteryPct: dto.batteryPct,
        isBackground: dto.isBackground ?? false,
      },
    });
    if (dto.actorType === 'DRIVER') {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { id: dto.actorId },
      });
      if (driver)
        await this.prisma.mobilityDriver.update({
          where: { id: dto.actorId },
          data: {
            currentLat: dto.lat,
            currentLng: dto.lng,
            lastLocationAt: new Date(),
          },
        });
    }
    return point;
  }

  async getTripRoute(tripId: string) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    const points = await this.prisma.mobilityLocationTrace.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    let realDistanceKm = 0;
    for (let i = 1; i < points.length; i++)
      realDistanceKm += this.haversineKm(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    return {
      tripId,
      status: trip.status,
      origin: {
        lat: trip.originLat,
        lng: trip.originLng,
        address: trip.originAddress,
      },
      destination: {
        lat: trip.destinationLat,
        lng: trip.destinationLng,
        address: trip.destinationAddress,
      },
      pointCount: points.length,
      realDistanceKm,
      points,
    };
  }

  async evaluateCancellation(tripId: string, dto: EvaluateCancellationDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (['COMPLETED', 'CANCELLED'].includes(trip.status))
      throw new BadRequestException('El viaje ya esta cerrado.');
    const points = await this.prisma.mobilityLocationTrace.findMany({
      where: { tripId, actorType: 'DRIVER' },
      orderBy: { createdAt: 'asc' },
    });
    const last = points.length ? points[points.length - 1] : null;
    const driverDistanceToPickupKm = last
      ? this.haversineKm(last.lat, last.lng, trip.originLat, trip.originLng)
      : null;
    const driverWaitSeconds = trip.driverArrivedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(trip.driverArrivedAt).getTime()) / 1000,
          ),
        )
      : null;
    const fee = dto.baseCancellationFee ?? 0;
    const requester = dto.requestedByType.toUpperCase();
    const closeToPickup =
      driverDistanceToPickupKm !== null && driverDistanceToPickupKm <= 0.3;
    const hasArrivalEvidence = Boolean(trip.driverArrivedAt) || closeToPickup;
    const chargePassenger =
      requester === 'PASSENGER' && hasArrivalEvidence && fee > 0;
    const decision = chargePassenger
      ? 'CHARGE_ALLOWED'
      : requester === 'PASSENGER'
        ? 'NO_AUTOMATIC_CHARGE'
        : 'NO_PASSENGER_CHARGE';
    const data = {
      requestedByType: requester,
      requestedById: dto.requestedById,
      reason: dto.reason,
      decision,
      chargePassenger,
      compensateDriver: chargePassenger,
      passengerChargeAmount: chargePassenger ? fee : 0,
      driverCompensationAmount: chargePassenger ? fee : 0,
      driverDistanceToPickupKm,
      driverWaitSeconds,
      evidence: {
        locationPointCount: points.length,
        hasArrivalEvidence,
        closeToPickup,
        tripStatusAtEvaluation: trip.status,
      },
      reviewedAt: new Date(),
    };
    const cancellationCase = await this.prisma.mobilityCancellationCase.upsert({
      where: { tripId },
      update: data,
      create: { tripId, ...data },
    });
    return {
      cancellationCase,
      explanation: chargePassenger
        ? 'Hay evidencia de que el conductor llego o estuvo muy cerca del punto de recogida.'
        : 'No existe evidencia suficiente para cobrar automaticamente al pasajero.',
    };
  }

  async triggerSafetyIncident(dto: TriggerSafetyIncidentDto) {
    if (!dto.tripId && !dto.driverId && !dto.userId)
      throw new BadRequestException(
        'El incidente necesita tripId, driverId o userId.',
      );
    const incident = await this.prisma.mobilitySafetyIncident.create({
      data: {
        tripId: dto.tripId,
        driverId: dto.driverId,
        userId: dto.userId,
        type: dto.type,
        severity: dto.severity ?? 'HIGH',
        triggerSource: dto.triggerSource ?? 'APP',
        silentMode: dto.silentMode ?? true,
        lat: dto.lat,
        lng: dto.lng,
        notes: dto.notes,
        metadata: {
          escalationState: 'CONTACTS_PENDING',
          emergencyServicesCalled: false,
          note: 'No se llama automaticamente a policia sin integracion autorizada. El backend deja el incidente listo para escalamiento.',
        },
      },
    });
    return {
      incident,
      actions: [
        'START_HIGH_FREQUENCY_LOCATION',
        'NOTIFY_TRUSTED_CONTACTS',
        'PRESERVE_ROUTE_EVIDENCE',
        'KEEP_UI_DISCREET',
      ],
    };
  }

  listOpenSafetyIncidents() {
    return this.prisma.mobilitySafetyIncident.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveSafetyIncident(id: string, dto: ResolveSafetyIncidentDto) {
    const incident = await this.prisma.mobilitySafetyIncident.findUnique({
      where: { id },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado.');
    return this.prisma.mobilitySafetyIncident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        notes: dto.notes ?? incident.notes,
      },
    });
  }

  addTrustedContact(dto: CreateTrustedContactDto) {
    return this.prisma.mobilityTrustedContact.create({
      data: {
        ownerUserId: dto.ownerUserId,
        name: dto.name,
        phone: dto.phone,
        priority: dto.priority ?? 1,
        notifyOnTrip: dto.notifyOnTrip ?? false,
        notifyOnEmergency: dto.notifyOnEmergency ?? true,
      },
    });
  }
  listTrustedContacts(ownerUserId: string) {
    return this.prisma.mobilityTrustedContact.findMany({
      where: { ownerUserId, isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }
  createTracker(dto: CreateTrackerDto) {
    return this.prisma.mobilityVehicleTracker.create({
      data: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        deviceLabel: dto.deviceLabel,
        provider: dto.provider,
        deviceUid: dto.deviceUid,
        monthlyCost: dto.monthlyCost,
      },
    });
  }

  async trackerPing(trackerId: string, dto: TrackerPingDto) {
    const tracker = await this.prisma.mobilityVehicleTracker.findUnique({
      where: { id: trackerId },
    });
    if (!tracker) throw new NotFoundException('GPS no registrado.');
    return this.prisma.mobilityVehicleTracker.update({
      where: { id: trackerId },
      data: { lastLat: dto.lat, lastLng: dto.lng, lastSeenAt: new Date() },
    });
  }

  async createLostItemCase(dto: CreateLostItemDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: dto.tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (trip.passengerUserId !== dto.passengerUserId)
      throw new BadRequestException('El pasajero no corresponde al viaje.');
    return this.prisma.mobilityLostItemCase.create({
      data: {
        tripId: dto.tripId,
        passengerUserId: dto.passengerUserId,
        description: dto.description,
        lastKnownPlace: dto.lastKnownPlace,
      },
    });
  }

  async registerLostItemContactAttempt(id: string) {
    const item = await this.prisma.mobilityLostItemCase.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('Caso no encontrado.');
    return this.prisma.mobilityLostItemCase.update({
      where: { id },
      data: { contactAttempts: { increment: 1 } },
    });
  }

  async rewardSummary(driverId: string) {
    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado.');
    const ledger = await this.prisma.mobilityRewardLedger.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });
    const totals = ledger.reduce(
      (a, r) => {
        a.points += r.points;
        a.creditAmount += r.creditAmount;
        return a;
      },
      { points: 0, creditAmount: 0 },
    );
    let level = 'NUEVO';
    if (driver.totalTrips >= 100) level = 'CONFIABLE';
    else if (driver.totalTrips >= 25) level = 'FRECUENTE';
    else if (driver.totalTrips >= 5) level = 'ACTIVO';
    return {
      driverId,
      totalTrips: driver.totalTrips,
      level,
      ...totals,
      ledger,
    };
  }

  async applyTripReward(tripId: string) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (trip.status !== 'COMPLETED' || !trip.driverId)
      throw new BadRequestException('Solo se recompensa un viaje completado.');
    const existing = await this.prisma.mobilityRewardLedger.findFirst({
      where: {
        driverId: trip.driverId,
        type: 'TRIP_COMPLETED',
        metadata: { path: ['tripId'], equals: tripId },
      },
    });
    if (existing) return existing;
    return this.prisma.mobilityRewardLedger.create({
      data: {
        driverId: trip.driverId,
        type: 'TRIP_COMPLETED',
        points: 10,
        creditAmount: 0,
        reason: 'Viaje completado correctamente',
        metadata: { tripId },
      },
    });
  }

  async createScheduledRoute(dto: CreateScheduledRouteDto) {
    const departureAt = new Date(dto.departureAt);
    if (Number.isNaN(departureAt.getTime()))
      throw new BadRequestException('departureAt no es una fecha valida.');
    return this.prisma.mobilityScheduledRoute.create({
      data: {
        userId: dto.userId,
        originAddress: dto.originAddress,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destinationAddress: dto.destinationAddress,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        departureAt,
        seatsAvailable: dto.seatsAvailable ?? 1,
        suggestedContribution: dto.suggestedContribution,
        notes: dto.notes,
      },
    });
  }

  async findScheduledRoutes(
    originLat: number,
    originLng: number,
    destinationLat: number,
    destinationLng: number,
    radiusKm = 3,
  ) {
    const routes = await this.prisma.mobilityScheduledRoute.findMany({
      where: {
        status: 'OPEN',
        departureAt: { gte: new Date() },
        seatsAvailable: { gt: 0 },
      },
      orderBy: { departureAt: 'asc' },
      take: 200,
    });
    return routes
      .map((route) => {
        const originDistanceKm = this.haversineKm(
          originLat,
          originLng,
          route.originLat,
          route.originLng,
        );
        const destinationDistanceKm = this.haversineKm(
          destinationLat,
          destinationLng,
          route.destinationLat,
          route.destinationLng,
        );
        return {
          ...route,
          originDistanceKm,
          destinationDistanceKm,
          matchScoreKm: originDistanceKm + destinationDistanceKm,
        };
      })
      .filter(
        (r) =>
          r.originDistanceKm <= radiusKm && r.destinationDistanceKm <= radiusKm,
      )
      .sort((a, b) => a.matchScoreKm - b.matchScoreKm);
  }
}
