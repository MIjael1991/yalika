import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CheckTripPinDto,
  CreateReferralCampaignDto,
  CreateReferralCodeDto,
  CreateSafeRideDto,
  CreateSafeRideIncidentDto,
  CreateSafeRideShareDto,
  EvaluateReferralDto,
  RedeemReferralDto,
  ReviewIdentityDto,
  ReviewVehicleComplianceDto,
  SafeRideLocationDto,
  StartSafeRideDto,
  UpsertVehicleComplianceDto,
  UpsertVerificationProfileDto,
  VerifyPhoneDto,
} from './phase5.dto';

@Injectable()
export class MobilityPhase5Service {
  constructor(private readonly prisma: PrismaService) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private parseDate(value?: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Fecha inválida: ${value}`);
    }
    return date;
  }

  private hashPin(pin: string) {
    return createHash('sha256').update(pin).digest('hex');
  }

  private async verificationEvent(
    subjectType: string,
    subjectId: string,
    action: string,
    status: string,
    actorId?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.mobilityVerificationEvent.create({
      data: {
        subjectType,
        subjectId,
        action,
        status,
        actorId,
        metadata: metadata as any,
      },
    });
  }

  async createReferralCampaign(dto: CreateReferralCampaignDto) {
    const startsAt = this.parseDate(dto.startsAt)!;
    const endsAt = this.parseDate(dto.endsAt)!;

    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha final debe ser posterior a la inicial.',
      );
    }

    return this.prisma.mobilityReferralCampaign.create({
      data: {
        name: dto.name,
        appliesTo: dto.appliesTo ?? 'BOTH',
        startsAt,
        endsAt,
        inviterRewardType: dto.inviterRewardType ?? 'PROMO_CREDIT',
        inviterRewardAmount: dto.inviterRewardAmount ?? 30,
        invitedRewardType: dto.invitedRewardType ?? 'PROMO_CREDIT',
        invitedRewardAmount: dto.invitedRewardAmount ?? 30,
        qualificationType: dto.qualificationType ?? 'FIRST_COMPLETED_TRIP',
        qualificationCount: dto.qualificationCount ?? 1,
        maxRewardsPerInviter: dto.maxRewardsPerInviter ?? 20,
        minQualifyingFare: dto.minQualifyingFare ?? 0,
      },
    });
  }

  async createReferralCode(dto: CreateReferralCodeDto) {
    const campaign = await this.prisma.mobilityReferralCampaign.findUnique({
      where: { id: dto.campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada.');

    if (dto.ownerDriverId) {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { id: dto.ownerDriverId },
      });
      if (!driver) throw new NotFoundException('Conductor no encontrado.');
      if (driver.userId !== dto.ownerUserId) {
        throw new BadRequestException(
          'El conductor no pertenece al usuario indicado.',
        );
      }
    }

    const code = `YAL-${randomBytes(4).toString('hex').toUpperCase()}`;

    return this.prisma.mobilityReferralCode.create({
      data: {
        campaignId: dto.campaignId,
        code,
        ownerUserId: dto.ownerUserId,
        ownerDriverId: dto.ownerDriverId,
        maxUses: dto.maxUses ?? 100,
        expiresAt: this.parseDate(dto.expiresAt),
      },
    });
  }

  async redeemReferral(dto: RedeemReferralDto) {
    const code = await this.prisma.mobilityReferralCode.findUnique({
      where: { code: dto.code },
    });
    if (!code || !code.isActive) {
      throw new NotFoundException('Código de referido no válido.');
    }

    const now = new Date();
    if (code.expiresAt && code.expiresAt < now) {
      throw new BadRequestException('El código de referido ya venció.');
    }
    if (code.uses >= code.maxUses) {
      throw new BadRequestException('El código alcanzó su límite de usos.');
    }
    if (code.ownerUserId === dto.referredUserId) {
      throw new BadRequestException('No puedes recomendarte a ti mismo.');
    }

    const campaign = await this.prisma.mobilityReferralCampaign.findUnique({
      where: { id: code.campaignId },
    });
    if (
      !campaign ||
      !campaign.isActive ||
      campaign.startsAt > now ||
      campaign.endsAt < now
    ) {
      throw new BadRequestException('La campaña no está activa.');
    }

    if (
      campaign.appliesTo !== 'BOTH' &&
      campaign.appliesTo !== dto.referredRole
    ) {
      throw new BadRequestException(
        'La campaña no aplica al tipo de usuario referido.',
      );
    }

    const already = await this.prisma.mobilityReferralAttribution.findUnique({
      where: { referredUserId: dto.referredUserId },
    });
    if (already) {
      throw new ConflictException(
        'Este usuario ya fue atribuido a otro referido.',
      );
    }

    const [inviterVerification, referredVerification] = await Promise.all([
      this.prisma.mobilityVerificationProfile.findUnique({
        where: {
          subjectType_subjectId: {
            subjectType: 'PASSENGER',
            subjectId: code.ownerUserId,
          },
        },
      }),
      this.prisma.mobilityVerificationProfile.findUnique({
        where: {
          subjectType_subjectId: {
            subjectType: dto.referredRole,
            subjectId:
              dto.referredRole === 'PASSENGER'
                ? dto.referredUserId
                : ((
                    await this.prisma.mobilityDriver.findUnique({
                      where: { userId: dto.referredUserId },
                    })
                  )?.id ?? dto.referredUserId),
          },
        },
      }),
    ]);

    let fraudReason: string | null = null;
    if (
      inviterVerification?.phone &&
      referredVerification?.phone &&
      inviterVerification.phone === referredVerification.phone
    ) {
      fraudReason = 'SAME_VERIFIED_PHONE';
    }

    const attribution = await this.prisma.mobilityReferralAttribution.create({
      data: {
        campaignId: campaign.id,
        codeId: code.id,
        inviterUserId: code.ownerUserId,
        inviterDriverId: code.ownerDriverId,
        referredUserId: dto.referredUserId,
        referredRole: dto.referredRole,
        status: fraudReason ? 'FRAUD_HOLD' : 'PENDING',
        fraudReason,
      },
    });

    await this.prisma.mobilityReferralCode.update({
      where: { id: code.id },
      data: { uses: { increment: 1 } },
    });

    return attribution;
  }

  private async creditPromo(
    userId: string,
    amount: number,
    referenceKey: string,
    description: string,
  ) {
    const existing = await this.prisma.mobilityPromoMovement.findUnique({
      where: { referenceKey },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.mobilityPromoBalance.upsert({
        where: { userId },
        create: {
          userId,
          available: amount,
          lifetimeEarned: amount,
        },
        update: {
          available: { increment: amount },
          lifetimeEarned: { increment: amount },
        },
      });

      return tx.mobilityPromoMovement.create({
        data: {
          balanceId: balance.id,
          userId,
          type: 'REFERRAL_REWARD',
          amount,
          referenceKey,
          description,
        },
      });
    });
  }

  private async issueReferralReward(args: {
    attributionId: string;
    beneficiaryType: string;
    beneficiaryUserId?: string;
    beneficiaryDriverId?: string;
    rewardType: string;
    amount: number;
  }) {
    const referenceKey = `ref:${args.attributionId}:${args.beneficiaryType}`;

    const existing = await this.prisma.mobilityReferralReward.findUnique({
      where: { referenceKey },
    });
    if (existing) return existing;

    if (args.rewardType === 'PROMO_CREDIT' && args.beneficiaryUserId) {
      await this.creditPromo(
        args.beneficiaryUserId,
        args.amount,
        referenceKey,
        'Recompensa por recomendación Yalika',
      );
    }

    if (
      args.rewardType === 'COMMISSION_FREE_TRIPS' &&
      args.beneficiaryDriverId
    ) {
      await this.prisma.mobilityDriverBenefit.create({
        data: {
          driverId: args.beneficiaryDriverId,
          code: `REF-${args.attributionId.slice(0, 8)}-${args.beneficiaryType}`,
          title: 'Viajes con comisión reducida por referido',
          description:
            'Beneficio ganado por una recomendación que cumplió los requisitos.',
          valuePct: 100,
          status: 'AVAILABLE',
          metadata: {
            freeTrips: Math.max(1, Math.round(args.amount)),
            attributionId: args.attributionId,
          } as any,
        },
      });
    }

    return this.prisma.mobilityReferralReward.create({
      data: {
        attributionId: args.attributionId,
        beneficiaryType: args.beneficiaryType,
        beneficiaryUserId: args.beneficiaryUserId,
        beneficiaryDriverId: args.beneficiaryDriverId,
        rewardType: args.rewardType,
        amount: args.amount,
        referenceKey,
      },
    });
  }

  async evaluateReferral(dto: EvaluateReferralDto) {
    const attribution =
      await this.prisma.mobilityReferralAttribution.findUnique({
        where: { id: dto.attributionId },
      });
    if (!attribution) {
      throw new NotFoundException('Atribución de referido no encontrada.');
    }
    if (attribution.status === 'FRAUD_HOLD') {
      return {
        qualified: false,
        status: attribution.status,
        reason: attribution.fraudReason,
      };
    }
    if (attribution.status === 'REWARDED') {
      return { qualified: true, status: 'REWARDED', alreadyRewarded: true };
    }

    const campaign = await this.prisma.mobilityReferralCampaign.findUnique({
      where: { id: attribution.campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada.');

    let qualifyingTrips = 0;
    let qualified = false;
    let referredDriverId: string | undefined;

    if (attribution.referredRole === 'PASSENGER') {
      qualifyingTrips = await this.prisma.mobilityTrip.count({
        where: {
          passengerUserId: attribution.referredUserId,
          status: 'COMPLETED',
          finalFare:
            campaign.minQualifyingFare > 0
              ? { gte: campaign.minQualifyingFare }
              : undefined,
        },
      });
    } else {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { userId: attribution.referredUserId },
      });
      referredDriverId = driver?.id;
      if (driver) {
        qualifyingTrips = await this.prisma.mobilityTrip.count({
          where: {
            driverId: driver.id,
            status: 'COMPLETED',
            finalFare:
              campaign.minQualifyingFare > 0
                ? { gte: campaign.minQualifyingFare }
                : undefined,
          },
        });

        if (campaign.qualificationType === 'DRIVER_VERIFIED') {
          const profile =
            await this.prisma.mobilityVerificationProfile.findUnique({
              where: {
                subjectType_subjectId: {
                  subjectType: 'DRIVER',
                  subjectId: driver.id,
                },
              },
            });
          qualified =
            driver.status === 'APPROVED' &&
            profile?.identityStatus === 'APPROVED' &&
            profile.phoneVerified &&
            profile.documentVerified;
        }
      }
    }

    if (campaign.qualificationType === 'FIRST_COMPLETED_TRIP') {
      qualified = qualifyingTrips >= 1;
    } else if (campaign.qualificationType === 'COMPLETED_TRIPS') {
      qualified = qualifyingTrips >= campaign.qualificationCount;
    }

    await this.prisma.mobilityReferralAttribution.update({
      where: { id: attribution.id },
      data: {
        qualifyingTrips,
        status: qualified ? 'QUALIFIED' : 'PENDING',
        qualifiedAt: qualified ? new Date() : null,
      },
    });

    if (!qualified) {
      return {
        qualified: false,
        qualifyingTrips,
        required: campaign.qualificationCount,
      };
    }

    const inviterRewardCount = await this.prisma.mobilityReferralReward.count({
      where: {
        beneficiaryType: 'INVITER',
        beneficiaryUserId: attribution.inviterUserId,
        status: 'ISSUED',
      },
    });

    if (inviterRewardCount >= campaign.maxRewardsPerInviter) {
      return {
        qualified: true,
        rewarded: false,
        reason: 'INVITER_REWARD_LIMIT_REACHED',
      };
    }

    const inviterReward = await this.issueReferralReward({
      attributionId: attribution.id,
      beneficiaryType: 'INVITER',
      beneficiaryUserId: attribution.inviterUserId,
      beneficiaryDriverId: attribution.inviterDriverId ?? undefined,
      rewardType: campaign.inviterRewardType,
      amount: campaign.inviterRewardAmount,
    });

    const invitedReward = await this.issueReferralReward({
      attributionId: attribution.id,
      beneficiaryType: 'REFERRED',
      beneficiaryUserId: attribution.referredUserId,
      beneficiaryDriverId: referredDriverId,
      rewardType: campaign.invitedRewardType,
      amount: campaign.invitedRewardAmount,
    });

    await this.prisma.mobilityReferralAttribution.update({
      where: { id: attribution.id },
      data: {
        status: 'REWARDED',
        rewardedAt: new Date(),
      },
    });

    return {
      qualified: true,
      rewarded: true,
      qualifyingTrips,
      inviterReward,
      invitedReward,
    };
  }

  async referralSummary(userId: string) {
    const [balance, codes, attributions, rewards] = await Promise.all([
      this.prisma.mobilityPromoBalance.findUnique({ where: { userId } }),
      this.prisma.mobilityReferralCode.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mobilityReferralAttribution.findMany({
        where: { inviterUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mobilityReferralReward.findMany({
        where: { beneficiaryUserId: userId },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    return { balance, codes, attributions, rewards };
  }

  async upsertVerificationProfile(dto: UpsertVerificationProfileDto) {
    if (dto.subjectType === 'DRIVER') {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { id: dto.subjectId },
      });
      if (!driver) throw new NotFoundException('Conductor no encontrado.');
    }

    const profile = await this.prisma.mobilityVerificationProfile.upsert({
      where: {
        subjectType_subjectId: {
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
        },
      },
      create: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        phone: dto.phone,
      },
      update: {
        phone: dto.phone ?? undefined,
      },
    });

    await this.verificationEvent(
      dto.subjectType,
      dto.subjectId,
      'PROFILE_UPSERTED',
      profile.identityStatus,
    );

    return profile;
  }

  async verifyPhone(
    subjectType: string,
    subjectId: string,
    dto: VerifyPhoneDto,
  ) {
    const profile = await this.prisma.mobilityVerificationProfile.findUnique({
      where: {
        subjectType_subjectId: { subjectType, subjectId },
      },
    });
    if (!profile) {
      throw new NotFoundException('Perfil de verificación no encontrado.');
    }

    const updated = await this.prisma.mobilityVerificationProfile.update({
      where: {
        subjectType_subjectId: { subjectType, subjectId },
      },
      data: {
        phoneVerified: dto.verified,
        trustLevel:
          dto.verified && profile.identityStatus === 'APPROVED'
            ? 'VERIFIED'
            : profile.trustLevel,
      },
    });

    await this.verificationEvent(
      subjectType,
      subjectId,
      'PHONE_VERIFICATION_CHANGED',
      dto.verified ? 'VERIFIED' : 'UNVERIFIED',
      dto.actorId,
    );

    return {
      ...updated,
      warning:
        'MVP: este endpoint registra el resultado. Producción debe usar OTP real y no confiar en un booleano enviado por el cliente.',
    };
  }

  async reviewIdentity(
    subjectType: string,
    subjectId: string,
    dto: ReviewIdentityDto,
  ) {
    const profile = await this.prisma.mobilityVerificationProfile.findUnique({
      where: {
        subjectType_subjectId: { subjectType, subjectId },
      },
    });
    if (!profile) {
      throw new NotFoundException('Perfil de verificación no encontrado.');
    }

    if (dto.status === 'REJECTED' && !dto.reason) {
      throw new BadRequestException(
        'Debes indicar un motivo para rechazar la identidad.',
      );
    }

    const selfieVerified =
      dto.status === 'APPROVED'
        ? (dto.selfieVerified ?? profile.selfieVerified)
        : false;
    const documentVerified =
      dto.status === 'APPROVED'
        ? (dto.documentVerified ?? profile.documentVerified)
        : false;

    const updated = await this.prisma.mobilityVerificationProfile.update({
      where: {
        subjectType_subjectId: { subjectType, subjectId },
      },
      data: {
        identityStatus: dto.status,
        selfieVerified,
        documentVerified,
        reviewedBy: dto.reviewedBy,
        reviewedAt: new Date(),
        trustLevel:
          dto.status === 'APPROVED' &&
          profile.phoneVerified &&
          selfieVerified &&
          documentVerified
            ? 'VERIFIED'
            : dto.status === 'REJECTED'
              ? 'RESTRICTED'
              : profile.trustLevel,
        riskFlags:
          dto.status === 'REJECTED'
            ? ({ identityReviewReason: dto.reason } as any)
            : undefined,
      },
    });

    await this.verificationEvent(
      subjectType,
      subjectId,
      'IDENTITY_REVIEWED',
      dto.status,
      dto.reviewedBy,
      { reason: dto.reason },
    );

    return updated;
  }

  async upsertVehicleCompliance(dto: UpsertVehicleComplianceDto) {
    const vehicle = await this.prisma.mobilityVehicle.findUnique({
      where: { id: dto.vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado.');

    if (
      dto.serviceType === 'TAXI' &&
      !dto.taxiPermitNumber &&
      !dto.taxiConcessionRef
    ) {
      throw new BadRequestException(
        'Para taxi debes registrar permiso o referencia de concesión.',
      );
    }

    return this.prisma.mobilityVehicleCompliance.upsert({
      where: { vehicleId: dto.vehicleId },
      create: {
        vehicleId: dto.vehicleId,
        serviceType: dto.serviceType,
        taxiPermitNumber: dto.taxiPermitNumber,
        taxiConcessionRef: dto.taxiConcessionRef,
        permitExpiresAt: this.parseDate(dto.permitExpiresAt),
        insuranceExpiresAt: this.parseDate(dto.insuranceExpiresAt),
      },
      update: {
        serviceType: dto.serviceType,
        taxiPermitNumber: dto.taxiPermitNumber,
        taxiConcessionRef: dto.taxiConcessionRef,
        permitExpiresAt: this.parseDate(dto.permitExpiresAt),
        insuranceExpiresAt: this.parseDate(dto.insuranceExpiresAt),
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      },
    });
  }

  async reviewVehicleCompliance(
    complianceId: string,
    dto: ReviewVehicleComplianceDto,
  ) {
    const row = await this.prisma.mobilityVehicleCompliance.findUnique({
      where: { id: complianceId },
    });
    if (!row)
      throw new NotFoundException('Expediente vehicular no encontrado.');

    if (dto.status === 'REJECTED' && !dto.rejectionReason) {
      throw new BadRequestException('Debes indicar motivo cuando se rechaza.');
    }

    return this.prisma.mobilityVehicleCompliance.update({
      where: { id: complianceId },
      data: {
        status: dto.status,
        inspectionStatus:
          dto.inspectionStatus ??
          (dto.status === 'APPROVED' ? 'APPROVED' : row.inspectionStatus),
        reviewedBy: dto.reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: dto.status === 'REJECTED' ? dto.rejectionReason : null,
      },
    });
  }

  async driverVerification(driverId: string) {
    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado.');

    const [profile, documents, vehicles] = await Promise.all([
      this.prisma.mobilityVerificationProfile.findUnique({
        where: {
          subjectType_subjectId: {
            subjectType: 'DRIVER',
            subjectId: driverId,
          },
        },
      }),
      this.prisma.mobilityDriverDocument.findMany({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mobilityVehicle.findMany({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const vehicleCompliance =
      await this.prisma.mobilityVehicleCompliance.findMany({
        where: { vehicleId: { in: vehicles.map((v) => v.id) } },
      });

    const approvedDocs = documents.filter((d) => d.status === 'APPROVED');
    const activeVehicle = vehicles.find((v) => v.isActive);
    const activeCompliance = activeVehicle
      ? vehicleCompliance.find((c) => c.vehicleId === activeVehicle.id)
      : undefined;

    const verified =
      driver.status === 'APPROVED' &&
      profile?.phoneVerified === true &&
      profile.identityStatus === 'APPROVED' &&
      profile.documentVerified === true &&
      approvedDocs.length > 0 &&
      activeVehicle?.status === 'APPROVED' &&
      activeCompliance?.status === 'APPROVED';

    return {
      verified,
      badge: verified
        ? activeCompliance?.serviceType === 'TAXI'
          ? 'TAXI_VERIFICADO_YALEKA'
          : 'CONDUCTOR_VERIFICADO_YALEKA'
        : 'VERIFICACION_INCOMPLETA',
      driver,
      profile,
      documents,
      vehicles,
      vehicleCompliance,
    };
  }

  async passengerVerification(userId: string) {
    const profile = await this.prisma.mobilityVerificationProfile.findUnique({
      where: {
        subjectType_subjectId: {
          subjectType: 'PASSENGER',
          subjectId: userId,
        },
      },
    });

    const completedTrips = await this.prisma.mobilityTrip.count({
      where: { passengerUserId: userId, status: 'COMPLETED' },
    });

    return {
      verified:
        profile?.phoneVerified === true &&
        profile.identityStatus === 'APPROVED' &&
        !profile.blocked,
      profile,
      completedTrips,
    };
  }

  async checkTripPin(tripId: string, dto: CheckTripPinDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');

    const since = new Date(Date.now() - 10 * 60 * 1000);
    const failures = await this.prisma.mobilityPinAttempt.count({
      where: {
        tripId,
        success: false,
        createdAt: { gte: since },
      },
    });

    if (failures >= 5) {
      throw new HttpException(
        'Demasiados intentos de PIN. Espera antes de volver a intentar.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const success = trip.safetyPin === dto.safetyPin;

    await this.prisma.mobilityPinAttempt.create({
      data: {
        tripId,
        passengerUserId: dto.passengerUserId,
        driverId: dto.driverId,
        success,
      },
    });

    return {
      success,
      attemptsRemaining: success ? 5 : Math.max(0, 4 - failures),
    };
  }

  async tripSafetyCenter(tripId: string) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
      include: {
        driver: true,
        vehicle: true,
      },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');

    const [
      passengerVerification,
      driverVerification,
      latestRisk,
      incidents,
      shares,
    ] = await Promise.all([
      this.passengerVerification(trip.passengerUserId),
      trip.driverId
        ? this.driverVerification(trip.driverId)
        : Promise.resolve(null),
      this.prisma.mobilityRiskAssessment.findFirst({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mobilitySafetyIncident.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.mobilityShareSession.findMany({
        where: { tripId, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      trip: {
        id: trip.id,
        status: trip.status,
        originAddress: trip.originAddress,
        destinationAddress: trip.destinationAddress,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
      },
      passenger: passengerVerification,
      driver: driverVerification
        ? {
            verified: driverVerification.verified,
            badge: driverVerification.badge,
            displayName: driverVerification.driver.displayName,
            rating: driverVerification.driver.rating,
          }
        : null,
      vehicle: trip.vehicle
        ? {
            brand: trip.vehicle.brand,
            model: trip.vehicle.model,
            color: trip.vehicle.color,
            plate: trip.vehicle.plate,
          }
        : null,
      latestRisk,
      incidents,
      activeShareLinks: shares.length,
      safetyFeatures: {
        pin: true,
        gpsTrace: true,
        shareTrip: true,
        trustedContacts: true,
        silentSos: true,
      },
    };
  }

  async createSafeRide(dto: CreateSafeRideDto) {
    const [driver, vehicle] = await Promise.all([
      this.prisma.mobilityDriver.findUnique({
        where: { id: dto.driverId },
      }),
      this.prisma.mobilityVehicle.findUnique({
        where: { id: dto.vehicleId },
      }),
    ]);

    if (!driver || driver.status !== 'APPROVED') {
      throw new BadRequestException('El conductor debe estar aprobado.');
    }
    if (
      !vehicle ||
      vehicle.driverId !== dto.driverId ||
      vehicle.status !== 'APPROVED' ||
      !vehicle.isActive
    ) {
      throw new BadRequestException(
        'El vehículo debe estar aprobado, activo y pertenecer al conductor.',
      );
    }

    const safetyPin = String(randomInt(1000, 10000));

    const ride = await this.prisma.mobilitySafeRide.create({
      data: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        passengerUserId: dto.passengerUserId,
        originAddress: dto.originAddress,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destinationAddress: dto.destinationAddress,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        safetyPinHash: this.hashPin(safetyPin),
        notes: dto.notes,
      },
    });

    return {
      ride,
      safetyPin,
      warning:
        'El PIN se devuelve una sola vez para la prueba. No se almacena en texto plano.',
    };
  }

  async startSafeRide(id: string, dto: StartSafeRideDto) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { id },
    });
    if (!ride) throw new NotFoundException('Viaje seguro no encontrado.');
    if (ride.status !== 'CREATED') {
      throw new BadRequestException(
        'El viaje seguro ya fue iniciado o cerrado.',
      );
    }

    if (ride.safetyPinHash !== this.hashPin(dto.safetyPin)) {
      throw new BadRequestException('PIN incorrecto.');
    }

    return this.prisma.mobilitySafeRide.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  async safeRideLocation(id: string, dto: SafeRideLocationDto) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { id },
    });
    if (!ride) throw new NotFoundException('Viaje seguro no encontrado.');
    if (ride.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Solo se registra ubicación durante un viaje seguro activo.',
      );
    }

    const [trace] = await this.prisma.$transaction([
      this.prisma.mobilitySafeRideTrace.create({
        data: {
          safeRideId: id,
          lat: dto.lat,
          lng: dto.lng,
          accuracyMeters: dto.accuracyMeters,
          source: dto.source ?? 'PHONE',
          isBackground: dto.isBackground ?? false,
        },
      }),
      this.prisma.mobilitySafeRide.update({
        where: { id },
        data: {
          lastLat: dto.lat,
          lastLng: dto.lng,
          lastLocationAt: new Date(),
        },
      }),
    ]);

    return trace;
  }

  async shareSafeRide(id: string, dto: CreateSafeRideShareDto) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { id },
    });
    if (!ride) throw new NotFoundException('Viaje seguro no encontrado.');
    if (ride.status === 'COMPLETED') {
      throw new BadRequestException('El viaje seguro ya terminó.');
    }

    const expiresInMinutes = dto.expiresInMinutes ?? 360;
    const token = randomBytes(24).toString('hex');
    const shareExpiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const updated = await this.prisma.mobilitySafeRide.update({
      where: { id },
      data: {
        shareToken: token,
        shareExpiresAt,
      },
    });

    return {
      safeRideId: id,
      token,
      expiresAt: shareExpiresAt,
      sharedPath: `/mobility/safe-rides/shared/${token}`,
      status: updated.status,
    };
  }

  async publicSafeRide(token: string) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { shareToken: token },
    });
    if (!ride || !ride.shareExpiresAt || ride.shareExpiresAt < new Date()) {
      throw new NotFoundException('Enlace inválido o vencido.');
    }

    const [driver, vehicle] = await Promise.all([
      this.prisma.mobilityDriver.findUnique({
        where: { id: ride.driverId },
      }),
      this.prisma.mobilityVehicle.findUnique({
        where: { id: ride.vehicleId },
      }),
    ]);

    return {
      status: ride.status,
      originAddress: ride.originAddress,
      destinationAddress: ride.destinationAddress,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      driver: driver
        ? {
            displayName: driver.displayName,
            rating: driver.rating,
          }
        : null,
      vehicle: vehicle
        ? {
            brand: vehicle.brand,
            model: vehicle.model,
            color: vehicle.color,
            plate: vehicle.plate,
          }
        : null,
      lastLocation:
        ride.lastLat !== null && ride.lastLng !== null
          ? {
              lat: ride.lastLat,
              lng: ride.lastLng,
              at: ride.lastLocationAt,
            }
          : null,
      expiresAt: ride.shareExpiresAt,
    };
  }

  async safeRideIncident(id: string, dto: CreateSafeRideIncidentDto) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { id },
    });
    if (!ride) throw new NotFoundException('Viaje seguro no encontrado.');

    const incident = await this.prisma.mobilitySafeRideIncident.create({
      data: {
        safeRideId: id,
        type: dto.type,
        severity: dto.severity ?? 'HIGH',
        silentMode: dto.silentMode ?? false,
        lat: dto.lat ?? ride.lastLat,
        lng: dto.lng ?? ride.lastLng,
        notes: dto.notes,
        metadata: {
          driverId: ride.driverId,
          vehicleId: ride.vehicleId,
          passengerUserId: ride.passengerUserId,
        } as any,
      },
    });

    return {
      incident,
      actions: [
        'KEEP_TRACKING_LOCATION',
        'PRESERVE_EVIDENCE',
        'SHOW_TRUSTED_CONTACT_ACTIONS',
        'PREPARE_OPERATOR_ESCALATION',
      ],
      emergencyServiceContacted: false,
      warning:
        'Yalika registró el incidente. No significa que policía/911 haya sido contactado.',
    };
  }

  async completeSafeRide(id: string) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { id },
    });
    if (!ride) throw new NotFoundException('Viaje seguro no encontrado.');
    if (ride.status !== 'IN_PROGRESS') {
      throw new BadRequestException('El viaje seguro no está activo.');
    }

    return this.prisma.mobilitySafeRide.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        shareExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  }
}
