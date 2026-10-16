import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class MobilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CONDUCTORES
  // ============================================================

  async createDriver(dto: CreateDriverDto) {
    const existing = await this.prisma.mobilityDriver.findUnique({
      where: { userId: dto.userId },
    });

    if (existing) {
      throw new ConflictException('El usuario ya tiene perfil de conductor.');
    }

    return this.prisma.mobilityDriver.create({
      data: {
        userId: dto.userId,
        displayName: dto.displayName.trim(),
        phone: dto.phone.trim(),
        status: 'PENDING_REVIEW',
        isAvailable: false,
      },
    });
  }

  async updateDriverAvailability(
    driverId: string,
    dto: UpdateDriverAvailabilityDto,
  ) {
    const driver = await this.requireDriver(driverId);

    if (driver.status !== 'APPROVED') {
      throw new BadRequestException(
        'El conductor debe estar aprobado antes de ponerse disponible.',
      );
    }

    return this.prisma.mobilityDriver.update({
      where: { id: driverId },
      data: {
        isAvailable: dto.isAvailable,
        currentLat: dto.lat ?? undefined,
        currentLng: dto.lng ?? undefined,
        lastLocationAt:
          dto.lat !== undefined && dto.lng !== undefined
            ? new Date()
            : undefined,
      },
    });
  }

  async findNearbyDrivers(lat: number, lng: number, radiusKm = 5) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Latitud y longitud son obligatorias.');
    }

    const drivers = await this.prisma.mobilityDriver.findMany({
      where: {
        status: 'APPROVED',
        isAvailable: true,
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: {
        vehicles: {
          where: { isActive: true, status: 'APPROVED' },
          take: 1,
        },
      },
      take: 300,
    });

    return drivers
      .map((driver) => ({
        ...driver,
        distanceKm: this.haversineKm(
          lat,
          lng,
          Number(driver.currentLat),
          Number(driver.currentLng),
        ),
      }))
      .filter((driver) => driver.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // ============================================================
  // VEHÍCULOS
  // ============================================================

  async createVehicle(dto: CreateVehicleDto) {
    await this.requireDriver(dto.driverId);

    const plate = dto.plate.toUpperCase().trim();

    const duplicate = await this.prisma.mobilityVehicle.findUnique({
      where: { plate },
    });

    if (duplicate) {
      throw new ConflictException('Las placas ya están registradas.');
    }

    return this.prisma.mobilityVehicle.create({
      data: {
        driverId: dto.driverId,
        brand: dto.brand.trim(),
        model: dto.model.trim(),
        year: dto.year,
        color: dto.color.trim(),
        plate,
        status: 'PENDING_REVIEW',
        isActive: true,
      },
    });
  }

  // ============================================================
  // VIAJES
  // ============================================================

  async createTrip(dto: CreateTripDto) {
    if (
      dto.originLat === dto.destinationLat &&
      dto.originLng === dto.destinationLng
    ) {
      throw new BadRequestException(
        'El origen y el destino no pueden ser iguales.',
      );
    }

    const safetyPin = this.generatePin();

    const trip = await this.prisma.mobilityTrip.create({
      data: {
        passengerUserId: dto.passengerUserId,
        originAddress: dto.originAddress.trim(),
        originLat: dto.originLat,
        originLng: dto.originLng,
        destinationAddress: dto.destinationAddress.trim(),
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        passengerSuggestedFare: dto.passengerSuggestedFare,
        notes: dto.notes?.trim(),
        status: 'REQUESTED',
        safetyPin,
      },
      include: {
        offers: true,
      },
    });

    await this.prisma.mobilityTripEvent.create({
      data: {
        tripId: trip.id,
        type: 'TRIP_REQUESTED',
        actorType: 'PASSENGER',
        actorId: dto.passengerUserId,
      },
    });

    return trip;
  }

  async listTrips(filters: {
    passengerUserId?: string;
    driverId?: string;
    status?: string;
  }) {
    return this.prisma.mobilityTrip.findMany({
      where: {
        passengerUserId: filters.passengerUserId || undefined,
        driverId: filters.driverId || undefined,
        status: filters.status as any,
      },
      include: {
        offers: { orderBy: { createdAt: 'desc' } },
        driver: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getTrip(tripId: string) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
      include: {
        offers: {
          orderBy: { createdAt: 'desc' },
          include: { driver: true },
        },
        driver: true,
        vehicle: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado.');
    }

    return trip;
  }

  async updateTripLocation(tripId: string, dto: UpdateTripLocationDto) {
    const trip = await this.requireTrip(tripId);

    if (
      !['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(
        trip.status,
      )
    ) {
      throw new BadRequestException(
        'La ubicación solo puede actualizarse durante un viaje activo.',
      );
    }

    await this.prisma.mobilityTripEvent.create({
      data: {
        tripId,
        type: 'LOCATION_UPDATE',
        actorType: dto.actorType,
        actorId: dto.actorId,
        lat: dto.lat,
        lng: dto.lng,
        metadata: {
          accuracyMeters: dto.accuracyMeters ?? null,
        },
      },
    });

    if (dto.actorType === 'DRIVER' && trip.driverId === dto.actorId) {
      await this.prisma.mobilityDriver.update({
        where: { id: dto.actorId },
        data: {
          currentLat: dto.lat,
          currentLng: dto.lng,
          lastLocationAt: new Date(),
        },
      });
    }

    return { ok: true };
  }

  // ============================================================
  // NEGOCIACIÓN / OFERTAS
  // ============================================================

  async createOffer(tripId: string, dto: CreateOfferDto) {
    const trip = await this.requireTrip(tripId);
    const driver = await this.requireDriver(dto.driverId);

    if (!['REQUESTED', 'NEGOTIATING'].includes(trip.status)) {
      throw new BadRequestException('Este viaje ya no acepta nuevas ofertas.');
    }

    if (driver.status !== 'APPROVED' || !driver.isAvailable) {
      throw new BadRequestException(
        'El conductor no está habilitado para recibir viajes.',
      );
    }

    const vehicle = await this.prisma.mobilityVehicle.findFirst({
      where: {
        driverId: dto.driverId,
        isActive: true,
        status: 'APPROVED',
      },
    });

    if (!vehicle) {
      throw new BadRequestException(
        'El conductor no tiene un vehículo aprobado y activo.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.mobilityTrip.update({
        where: { id: tripId },
        data: { status: 'NEGOTIATING' },
      });

      const existing = await tx.mobilityOffer.findFirst({
        where: {
          tripId,
          driverId: dto.driverId,
          status: 'PENDING',
        },
      });

      if (existing) {
        return tx.mobilityOffer.update({
          where: { id: existing.id },
          data: {
            amount: dto.amount,
            etaMinutes: dto.etaMinutes,
          },
        });
      }

      return tx.mobilityOffer.create({
        data: {
          tripId,
          driverId: dto.driverId,
          vehicleId: vehicle.id,
          amount: dto.amount,
          etaMinutes: dto.etaMinutes,
          status: 'PENDING',
        },
      });
    });
  }

  async acceptOffer(tripId: string, offerId: string, dto: AcceptOfferDto) {
    const trip = await this.requireTrip(tripId);

    if (!['REQUESTED', 'NEGOTIATING'].includes(trip.status)) {
      throw new BadRequestException('El viaje ya fue asignado o cerrado.');
    }

    if (trip.passengerUserId !== dto.passengerUserId) {
      throw new BadRequestException(
        'Solo el pasajero que creó el viaje puede aceptar una oferta.',
      );
    }

    const offer = await this.prisma.mobilityOffer.findFirst({
      where: {
        id: offerId,
        tripId,
        status: 'PENDING',
      },
    });

    if (!offer) {
      throw new NotFoundException('Oferta no encontrada o ya no disponible.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.mobilityOffer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED' },
      });

      await tx.mobilityOffer.updateMany({
        where: {
          tripId,
          id: { not: offerId },
          status: 'PENDING',
        },
        data: { status: 'REJECTED' },
      });

      await tx.mobilityDriver.update({
        where: { id: offer.driverId },
        data: { isAvailable: false },
      });

      const updatedTrip = await tx.mobilityTrip.update({
        where: { id: tripId },
        data: {
          driverId: offer.driverId,
          vehicleId: offer.vehicleId,
          agreedFare: offer.amount,
          acceptedOfferId: offer.id,
          status: 'DRIVER_EN_ROUTE',
          assignedAt: new Date(),
        },
        include: {
          driver: true,
          vehicle: true,
          offers: true,
        },
      });

      await tx.mobilityTripEvent.create({
        data: {
          tripId,
          type: 'OFFER_ACCEPTED',
          actorType: 'PASSENGER',
          actorId: dto.passengerUserId,
          metadata: {
            offerId,
            driverId: offer.driverId,
            amount: Number(offer.amount),
          },
        },
      });

      return updatedTrip;
    });
  }

  // ============================================================
  // CICLO DE VIDA DEL VIAJE
  // ============================================================

  async arriveTrip(tripId: string, dto: ArriveTripDto) {
    const trip = await this.requireTrip(tripId);

    if (trip.status !== 'DRIVER_EN_ROUTE') {
      throw new BadRequestException(
        'El conductor no puede marcar llegada en este estado.',
      );
    }

    if (trip.driverId !== dto.driverId) {
      throw new BadRequestException('Conductor no asignado al viaje.');
    }

    const updated = await this.prisma.mobilityTrip.update({
      where: { id: tripId },
      data: {
        status: 'DRIVER_ARRIVED',
        driverArrivedAt: new Date(),
      },
    });

    await this.prisma.mobilityTripEvent.create({
      data: {
        tripId,
        type: 'DRIVER_ARRIVED',
        actorType: 'DRIVER',
        actorId: dto.driverId,
      },
    });

    return updated;
  }

  async startTrip(tripId: string, dto: StartTripDto) {
    const trip = await this.requireTrip(tripId);

    if (!['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'].includes(trip.status)) {
      throw new BadRequestException('El viaje no está listo para iniciar.');
    }

    if (!trip.driverId || trip.driverId !== dto.driverId) {
      throw new BadRequestException(
        'Este conductor no está asignado al viaje.',
      );
    }

    if (trip.safetyPin !== dto.safetyPin) {
      throw new BadRequestException('PIN de seguridad incorrecto.');
    }

    const updated = await this.prisma.mobilityTrip.update({
      where: { id: tripId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    await this.prisma.mobilityTripEvent.create({
      data: {
        tripId,
        type: 'TRIP_STARTED',
        actorType: 'DRIVER',
        actorId: dto.driverId,
      },
    });

    return updated;
  }

  async completeTrip(tripId: string, dto: CompleteTripDto) {
    const trip = await this.requireTrip(tripId);

    if (trip.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Solo un viaje en curso puede finalizar.');
    }

    if (trip.driverId !== dto.driverId) {
      throw new BadRequestException('Conductor no asignado al viaje.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mobilityTrip.update({
        where: { id: tripId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          finalFare: dto.finalFare ?? trip.agreedFare,
        },
      });

      if (trip.driverId) {
        await tx.mobilityDriver.update({
          where: { id: trip.driverId },
          data: { isAvailable: true, totalTrips: { increment: 1 } },
        });
      }

      await tx.mobilityTripEvent.create({
        data: {
          tripId,
          type: 'TRIP_COMPLETED',
          actorType: 'DRIVER',
          actorId: dto.driverId,
          metadata: {
            finalFare: Number(dto.finalFare ?? trip.agreedFare ?? 0),
          },
        },
      });

      return updated;
    });
  }

  async cancelTrip(tripId: string, dto: CancelTripDto) {
    const trip = await this.requireTrip(tripId);

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestException('El viaje ya está cerrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mobilityTrip.update({
        where: { id: tripId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: dto.reason?.trim() || null,
          cancelledBy: dto.actorType,
        },
      });

      await tx.mobilityOffer.updateMany({
        where: {
          tripId,
          status: 'PENDING',
        },
        data: { status: 'CANCELLED' },
      });

      if (trip.driverId) {
        await tx.mobilityDriver.update({
          where: { id: trip.driverId },
          data: { isAvailable: true },
        });
      }

      await tx.mobilityTripEvent.create({
        data: {
          tripId,
          type: 'TRIP_CANCELLED',
          actorType: dto.actorType,
          actorId: dto.actorId,
          metadata: {
            reason: dto.reason ?? null,
          },
        },
      });

      return updated;
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async requireDriver(driverId: string) {
    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Conductor no encontrado.');
    }

    return driver;
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado.');
    }

    return trip;
  }

  private generatePin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
