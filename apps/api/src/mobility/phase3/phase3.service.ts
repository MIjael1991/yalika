import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBonusCampaignDto,
  CreateFareQuoteDto,
  CreatePricingPolicyDto,
  CreateServicePaymentPlanDto,
  CreateShareSessionDto,
  CreditTripEarningsDto,
  DeviceHeartbeatDto,
  OpportunityPreferenceDto,
} from './phase3.dto';

@Injectable()
export class MobilityPhase3Service {
  constructor(private readonly prisma: PrismaService) {}

  async createPricingPolicy(dto: CreatePricingPolicyDto) {
    return this.prisma.mobilityPricingPolicy.create({
      data: {
        name: dto.name,
        city: dto.city,
        baseFare: dto.baseFare ?? 10,
        perKm: dto.perKm ?? 5,
        perMinute: dto.perMinute ?? 1,
        minimumFare: dto.minimumFare ?? 30,
        platformPercent: dto.platformPercent ?? 8,
        driverMinimumPercent: dto.driverMinimumPercent ?? 85,
        maxSurgeMultiplier: dto.maxSurgeMultiplier ?? 1.25,
      },
    });
  }

  async activePricingPolicy(city?: string) {
    const byCity = city
      ? await this.prisma.mobilityPricingPolicy.findFirst({
          where: { isActive: true, city },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (byCity) return byCity;

    const generic = await this.prisma.mobilityPricingPolicy.findFirst({
      where: { isActive: true, city: null },
      orderBy: { updatedAt: 'desc' },
    });

    return generic;
  }

  async quote(dto: CreateFareQuoteDto, city?: string) {
    let policy = await this.activePricingPolicy(city);

    if (!policy) {
      policy = await this.prisma.mobilityPricingPolicy.create({
        data: {
          name: 'Yalika Económica Base',
          city: city ?? null,
          baseFare: 10,
          perKm: 5,
          perMinute: 1,
          minimumFare: 30,
          platformPercent: 8,
          driverMinimumPercent: 85,
          maxSurgeMultiplier: 1.25,
        },
      });
    }

    const requestedMultiplier = dto.demandMultiplier ?? 1;
    const demandMultiplier = Math.min(
      Math.max(1, requestedMultiplier),
      policy.maxSurgeMultiplier,
    );

    const raw =
      policy.baseFare +
      dto.estimatedKm * policy.perKm +
      dto.estimatedMinutes * policy.perMinute;

    let yalekaFare = Math.max(policy.minimumFare, raw * demandMultiplier);

    // Si existe referencia externa ingresada por el cliente/operador,
    // intentamos quedar al menos 5% debajo, sin romper la tarifa mínima.
    if (
      dto.competitorReference &&
      dto.competitorReference > policy.minimumFare
    ) {
      yalekaFare = Math.min(yalekaFare, dto.competitorReference * 0.95);
      yalekaFare = Math.max(yalekaFare, policy.minimumFare);
    }

    yalekaFare = Math.round(yalekaFare * 100) / 100;

    const platformFee =
      Math.round(yalekaFare * (policy.platformPercent / 100) * 100) / 100;
    const driverGross = Math.round((yalekaFare - platformFee) * 100) / 100;
    const driverPercent = yalekaFare > 0 ? (driverGross / yalekaFare) * 100 : 0;

    if (driverPercent < policy.driverMinimumPercent) {
      throw new BadRequestException(
        'La política actual deja al conductor por debajo del porcentaje mínimo permitido.',
      );
    }

    const savingsVsReference = dto.competitorReference
      ? Math.round((dto.competitorReference - yalekaFare) * 100) / 100
      : null;

    return this.prisma.mobilityFareQuote.create({
      data: {
        passengerUserId: dto.passengerUserId,
        driverId: dto.driverId,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        estimatedKm: dto.estimatedKm,
        estimatedMinutes: dto.estimatedMinutes,
        competitorReference: dto.competitorReference,
        yalekaFare,
        driverGross,
        platformFee,
        savingsVsReference,
        pricingPolicyId: policy.id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }

  async getOrCreateWallet(driverId: string) {
    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado.');

    return this.prisma.mobilityDriverWallet.upsert({
      where: { driverId },
      create: { driverId },
      update: {},
    });
  }

  async creditTripEarnings(dto: CreditTripEarningsDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: dto.tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (trip.status !== 'COMPLETED') {
      throw new BadRequestException('El viaje todavía no está completado.');
    }
    if (trip.driverId !== dto.driverId) {
      throw new BadRequestException('El conductor no corresponde al viaje.');
    }

    const duplicate = await this.prisma.mobilityWalletMovement.findFirst({
      where: {
        driverId: dto.driverId,
        type: 'TRIP_EARNING',
        referenceId: dto.tripId,
      },
    });
    if (duplicate) return duplicate;

    const policy = await this.activePricingPolicy();
    const platformPercent = dto.platformPercent ?? policy?.platformPercent ?? 8;
    const platformFee =
      Math.round(dto.fare * (platformPercent / 100) * 100) / 100;
    const driverAmount = Math.round((dto.fare - platformFee) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.mobilityDriverWallet.upsert({
        where: { driverId: dto.driverId },
        create: {
          driverId: dto.driverId,
          available: driverAmount,
          lifetimeEarned: driverAmount,
        },
        update: {
          available: { increment: driverAmount },
          lifetimeEarned: { increment: driverAmount },
        },
      });

      return tx.mobilityWalletMovement.create({
        data: {
          driverId: dto.driverId,
          walletId: wallet.id,
          type: 'TRIP_EARNING',
          amount: driverAmount,
          concept: `Ganancia viaje ${dto.tripId}`,
          referenceId: dto.tripId,
          metadata: {
            fare: dto.fare,
            platformPercent,
            platformFee,
          },
        },
      });
    });
  }

  async walletSummary(driverId: string) {
    const wallet = await this.getOrCreateWallet(driverId);
    const movements = await this.prisma.mobilityWalletMovement.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { wallet, movements };
  }

  async createBonusCampaign(dto: CreateBonusCampaignDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new BadRequestException('Fechas de campaña inválidas.');
    }

    return this.prisma.mobilityBonusCampaign.create({
      data: {
        name: dto.name,
        startsAt,
        endsAt,
        minTrips: dto.minTrips ?? 1,
        rewardPoints: dto.rewardPoints ?? 0,
        rewardAmount: dto.rewardAmount ?? 0,
        maxRewardsPerDriver: dto.maxRewardsPerDriver ?? 1,
        city: dto.city,
      },
    });
  }

  async heartbeat(dto: DeviceHeartbeatDto) {
    return this.prisma.mobilityDeviceHeartbeat.create({
      data: {
        deviceType: dto.deviceType,
        deviceId: dto.deviceId,
        userId: dto.userId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        tripId: dto.tripId,
        lat: dto.lat,
        lng: dto.lng,
        batteryPct: dto.batteryPct,
        networkType: dto.networkType,
        signalQuality: dto.signalQuality,
        appState: dto.appState,
      },
    });
  }

  async assessTripRisk(tripId: string) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');

    const recent = await this.prisma.mobilityDeviceHeartbeat.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const phone = recent.find((r) => r.deviceType === 'PHONE');
    const tracker = recent.find((r) => r.deviceType === 'VEHICLE_GPS');

    let riskScore = 0;
    const reasons: string[] = [];
    const now = Date.now();

    if (!phone || now - phone.createdAt.getTime() > 120000) {
      riskScore += 35;
      reasons.push('PHONE_SILENT_OVER_2_MIN');
    }

    if (
      phone?.batteryPct !== null &&
      phone?.batteryPct !== undefined &&
      phone.batteryPct <= 10
    ) {
      riskScore += 10;
      reasons.push('PHONE_LOW_BATTERY');
    }

    if (phone && tracker) {
      const latDiff = Math.abs((phone.lat ?? 0) - (tracker.lat ?? 0));
      const lngDiff = Math.abs((phone.lng ?? 0) - (tracker.lng ?? 0));
      if (latDiff + lngDiff > 0.03) {
        riskScore += 25;
        reasons.push('PHONE_AND_VEHICLE_SEPARATED');
      }
    }

    if (!tracker && trip.status === 'IN_PROGRESS') {
      reasons.push('NO_FIXED_TRACKER');
    }

    let level = 'LOW';
    if (riskScore >= 70) level = 'CRITICAL';
    else if (riskScore >= 45) level = 'HIGH';
    else if (riskScore >= 20) level = 'MEDIUM';

    return this.prisma.mobilityRiskAssessment.create({
      data: {
        tripId,
        riskScore,
        level,
        reasons,
        phoneLastSeenAt: phone?.createdAt,
        trackerLastSeenAt: tracker?.createdAt,
      },
    });
  }

  async createShareSession(tripId: string, dto: CreateShareSessionDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');

    const minutes = dto.expiresInMinutes ?? 180;
    const token = randomBytes(24).toString('hex');

    return this.prisma.mobilityShareSession.create({
      data: {
        tripId,
        ownerUserId: dto.ownerUserId,
        token,
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      },
    });
  }

  async sharedTrip(token: string) {
    const share = await this.prisma.mobilityShareSession.findUnique({
      where: { token },
    });

    if (!share || !share.isActive || share.expiresAt < new Date()) {
      throw new NotFoundException('Enlace de seguimiento no válido o vencido.');
    }

    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: share.tripId },
      include: {
        driver: {
          include: { vehicles: { where: { isActive: true }, take: 1 } },
        },
      },
    });

    const lastPoint = await this.prisma.mobilityLocationTrace.findFirst({
      where: { tripId: share.tripId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tripId: trip?.id,
      status: trip?.status,
      originAddress: trip?.originAddress,
      destinationAddress: trip?.destinationAddress,
      driver: trip?.driver
        ? {
            displayName: trip.driver.displayName,
            rating: trip.driver.rating,
            vehicle: trip.driver.vehicles?.[0] ?? null,
          }
        : null,
      lastLocation: lastPoint
        ? {
            lat: lastPoint.lat,
            lng: lastPoint.lng,
            createdAt: lastPoint.createdAt,
          }
        : null,
      expiresAt: share.expiresAt,
    };
  }

  async upsertOpportunityPreference(dto: OpportunityPreferenceDto) {
    return this.prisma.mobilityOpportunityPreference.upsert({
      where: { userId: dto.userId },
      create: {
        userId: dto.userId,
        enabled: dto.enabled,
        maxDetourKm: dto.maxDetourKm ?? 3,
        minimumContribution: dto.minimumContribution ?? 0,
        seats: dto.seats ?? 1,
        notes: dto.notes,
      },
      update: {
        enabled: dto.enabled,
        maxDetourKm: dto.maxDetourKm,
        minimumContribution: dto.minimumContribution,
        seats: dto.seats,
        notes: dto.notes,
      },
    });
  }

  async createServicePaymentPlan(dto: CreateServicePaymentPlanDto) {
    return this.prisma.mobilityServicePaymentPlan.create({
      data: {
        driverId: dto.driverId,
        name: dto.name,
        category: dto.category,
        amount: dto.amount,
        cadence: dto.cadence ?? 'MONTHLY',
        dayOfMonth: dto.dayOfMonth,
        autoUseWallet: dto.autoUseWallet ?? false,
      },
    });
  }

  async servicePaymentPlans(driverId: string) {
    return this.prisma.mobilityServicePaymentPlan.findMany({
      where: { driverId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async dashboard(driverId: string) {
    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado.');

    const wallet = await this.getOrCreateWallet(driverId);
    const benefits = await this.prisma.mobilityDriverBenefit.findMany({
      where: { driverId, status: 'AVAILABLE' },
      orderBy: { createdAt: 'desc' },
    });
    const plans = await this.servicePaymentPlans(driverId);

    return {
      driver: {
        id: driver.id,
        displayName: driver.displayName,
        rating: driver.rating,
        totalTrips: driver.totalTrips,
        isAvailable: driver.isAvailable,
      },
      wallet,
      benefits,
      paymentPlans: plans,
    };
  }
}
