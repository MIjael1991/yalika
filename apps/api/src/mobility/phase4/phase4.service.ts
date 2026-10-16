import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDriverDocumentDto,
  CreatePayoutDto,
  CreatePrivacyPolicyDto,
  CreateRatingDto,
  CreateSupportCaseDto,
  EscalateSafetyDto,
  MarkNotificationDto,
  PrivacyCleanupDto,
  QueueNotificationDto,
  ResolveSupportCaseDto,
  ReviewDriverDocumentDto,
  SettleCancellationDto,
} from './phase4.dto';

@Injectable()
export class MobilityPhase4Service {
  constructor(private readonly prisma: PrismaService) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async audit(
    action: string,
    entityType: string,
    entityId?: string,
    actorType = 'SYSTEM',
    actorId?: string,
    tripId?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.mobilityAuditEvent.create({
      data: {
        action,
        entityType,
        entityId,
        actorType,
        actorId,
        tripId,
        metadata: metadata as any,
      },
    });
  }

  async createRating(tripId: string, dto: CreateRatingDto) {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (trip.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Solo se puede calificar un viaje completado.',
      );
    }

    const rating = await this.prisma.mobilityRating.create({
      data: {
        tripId,
        authorType: dto.authorType,
        authorId: dto.authorId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        stars: dto.stars,
        comment: dto.comment,
      },
    });

    // Actualiza la calificaciÃ³n agregada del conductor cuando el objetivo sea DRIVER.
    if (dto.targetType.toUpperCase() === 'DRIVER') {
      const aggregate = await this.prisma.mobilityRating.aggregate({
        where: {
          targetType: 'DRIVER',
          targetId: dto.targetId,
        },
        _avg: { stars: true },
      });

      if (aggregate._avg.stars !== null) {
        await this.prisma.mobilityDriver.update({
          where: { id: dto.targetId },
          data: { rating: this.money(aggregate._avg.stars) },
        });
      }
    }

    await this.audit(
      'RATING_CREATED',
      'MobilityRating',
      rating.id,
      dto.authorType,
      dto.authorId,
      tripId,
      { stars: dto.stars, targetType: dto.targetType, targetId: dto.targetId },
    );

    return rating;
  }

  async ratingSummary(targetType: string, targetId: string) {
    const [aggregate, total] = await Promise.all([
      this.prisma.mobilityRating.aggregate({
        where: { targetType, targetId },
        _avg: { stars: true },
      }),
      this.prisma.mobilityRating.count({
        where: { targetType, targetId },
      }),
    ]);

    return {
      targetType,
      targetId,
      count: total,
      average:
        aggregate._avg.stars === null ? null : this.money(aggregate._avg.stars),
    };
  }

  async createSupportCase(dto: CreateSupportCaseDto) {
    const row = await this.prisma.mobilitySupportCase.create({
      data: {
        tripId: dto.tripId,
        userId: dto.userId,
        driverId: dto.driverId,
        category: dto.category,
        priority: dto.priority ?? 'NORMAL',
        subject: dto.subject,
        description: dto.description,
      },
    });

    await this.audit(
      'SUPPORT_CASE_CREATED',
      'MobilitySupportCase',
      row.id,
      'USER',
      dto.userId ?? dto.driverId,
      dto.tripId,
      { category: dto.category, priority: dto.priority ?? 'NORMAL' },
    );

    return row;
  }

  async resolveSupportCase(id: string, dto: ResolveSupportCaseDto) {
    const existing = await this.prisma.mobilitySupportCase.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('Caso de soporte no encontrado.');

    const row = await this.prisma.mobilitySupportCase.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolution: dto.resolution,
        assignedTo: dto.assignedTo,
        resolvedAt: new Date(),
      },
    });

    await this.audit(
      'SUPPORT_CASE_RESOLVED',
      'MobilitySupportCase',
      id,
      'STAFF',
      dto.assignedTo,
      existing.tripId ?? undefined,
    );

    return row;
  }

  async createDriverDocument(dto: CreateDriverDocumentDto) {
    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: dto.driverId },
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado.');

    let expiresAt: Date | undefined;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        throw new BadRequestException('expiresAt no es una fecha vÃ¡lida.');
      }
    }

    return this.prisma.mobilityDriverDocument.create({
      data: {
        driverId: dto.driverId,
        type: dto.type,
        documentNumber: dto.documentNumber,
        fileRef: dto.fileRef,
        expiresAt,
      },
    });
  }

  async reviewDriverDocument(id: string, dto: ReviewDriverDocumentDto) {
    const doc = await this.prisma.mobilityDriverDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado.');

    if (dto.status === 'REJECTED' && !dto.rejectionReason) {
      throw new BadRequestException(
        'Debes indicar el motivo cuando se rechaza un documento.',
      );
    }

    const updated = await this.prisma.mobilityDriverDocument.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.status === 'REJECTED' ? dto.rejectionReason : null,
        reviewedBy: dto.reviewedBy,
        reviewedAt: new Date(),
      },
    });

    await this.audit(
      'DRIVER_DOCUMENT_REVIEWED',
      'MobilityDriverDocument',
      id,
      'STAFF',
      dto.reviewedBy,
      undefined,
      { status: dto.status, driverId: doc.driverId },
    );

    return updated;
  }

  async expiringDocuments(days = 30) {
    const safeDays = Math.min(Math.max(days, 1), 365);
    const now = new Date();
    const limit = new Date(now.getTime() + safeDays * 86400000);

    return this.prisma.mobilityDriverDocument.findMany({
      where: {
        status: 'APPROVED',
        expiresAt: { gte: now, lte: limit },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async issueReceipt(tripId: string) {
    const existing = await this.prisma.mobilityTripReceipt.findUnique({
      where: { tripId },
    });

    if (existing) {
      const existingAudit = await this.prisma.mobilityAuditEvent.findFirst({
        where: {
          action: 'TRIP_RECEIPT_ISSUED',
          entityType: 'MobilityTripReceipt',
          entityId: existing.id,
          tripId,
        },
      });

      if (!existingAudit) {
        await this.audit(
          'TRIP_RECEIPT_ISSUED',
          'MobilityTripReceipt',
          existing.id,
          'SYSTEM',
          undefined,
          tripId,
          {
            receiptNo: existing.receiptNo,
            fare: existing.fare,
            backfilled: true,
          },
        );
      }

      return existing;
    }

    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
      include: {
        driver: {
          include: {
            vehicles: {
              where: { isActive: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (trip.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Solo se emite recibo de viajes completados.',
      );
    }

    const fare = this.money(
      Number(trip.finalFare ?? trip.agreedFare ?? trip.passengerSuggestedFare),
    );

    const earning = trip.driverId
      ? await this.prisma.mobilityWalletMovement.findFirst({
          where: {
            driverId: trip.driverId,
            type: 'TRIP_EARNING',
            referenceId: tripId,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const platformFee =
      earning?.metadata &&
      typeof earning.metadata === 'object' &&
      !Array.isArray(earning.metadata) &&
      'platformFee' in earning.metadata
        ? this.money(
            Number(
              (earning.metadata as Record<string, unknown>).platformFee ?? 0,
            ),
          )
        : 0;

    const driverAmount = this.money(fare - platformFee);
    const receiptNo = `YMK-${new Date().getFullYear()}-${tripId
      .slice(0, 8)
      .toUpperCase()}`;

    const receipt = await this.prisma.mobilityTripReceipt.create({
      data: {
        tripId,
        receiptNo,
        fare,
        platformFee,
        driverAmount,
        snapshot: {
          originAddress: trip.originAddress,
          destinationAddress: trip.destinationAddress,
          startedAt: trip.startedAt,
          completedAt: trip.completedAt,
          passengerUserId: trip.passengerUserId,
          driver: trip.driver
            ? {
                id: trip.driver.id,
                displayName: trip.driver.displayName,
                vehicle: trip.driver.vehicles?.[0] ?? null,
              }
            : null,
        },
      },
    });

    await this.audit(
      'TRIP_RECEIPT_ISSUED',
      'MobilityTripReceipt',
      receipt.id,
      'SYSTEM',
      undefined,
      tripId,
      {
        receiptNo: receipt.receiptNo,
        fare: receipt.fare,
        platformFee: receipt.platformFee,
        driverAmount: receipt.driverAmount,
      },
    );

    return receipt;
  }
  async settleCancellation(tripId: string, dto: SettleCancellationDto) {
    const existing =
      await this.prisma.mobilityCancellationSettlement.findUnique({
        where: { tripId },
      });
    if (existing) return existing;

    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado.');

    const ccase = await this.prisma.mobilityCancellationCase.findUnique({
      where: { tripId },
    });
    if (!ccase) {
      throw new BadRequestException(
        'Primero debe existir una evaluaciÃ³n de cancelaciÃ³n.',
      );
    }

    const passengerChargeAmount = this.money(
      dto.passengerChargeAmount ?? ccase.passengerChargeAmount,
    );
    const driverCompensationAmount = this.money(
      dto.driverCompensationAmount ?? ccase.driverCompensationAmount,
    );
    const platformAmount = this.money(dto.platformAmount ?? 0);

    if (
      driverCompensationAmount + platformAmount > passengerChargeAmount &&
      passengerChargeAmount > 0
    ) {
      throw new BadRequestException(
        'La distribuciÃ³n no puede superar el cargo al pasajero.',
      );
    }

    const settlement = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mobilityCancellationSettlement.create({
        data: {
          tripId,
          cancellationCaseId: ccase.id,
          decision: ccase.decision,
          passengerChargeAmount,
          driverCompensationAmount,
          platformAmount,
          reason: dto.reason ?? ccase.reason,
          settledBy: dto.settledBy,
          metadata: {
            driverDistanceToPickupKm: ccase.driverDistanceToPickupKm,
            driverWaitSeconds: ccase.driverWaitSeconds,
          },
        },
      });

      if (driverCompensationAmount > 0 && trip.driverId) {
        const wallet = await tx.mobilityDriverWallet.upsert({
          where: { driverId: trip.driverId },
          create: {
            driverId: trip.driverId,
            available: driverCompensationAmount,
            lifetimeEarned: driverCompensationAmount,
          },
          update: {
            available: { increment: driverCompensationAmount },
            lifetimeEarned: { increment: driverCompensationAmount },
          },
        });

        await tx.mobilityWalletMovement.create({
          data: {
            driverId: trip.driverId,
            walletId: wallet.id,
            type: 'CANCELLATION_COMPENSATION',
            amount: driverCompensationAmount,
            concept: `CompensaciÃ³n por cancelaciÃ³n ${tripId}`,
            referenceId: `cancel:${tripId}`,
            metadata: { settlementId: row.id },
          },
        });
      }

      return row;
    });

    await this.audit(
      'CANCELLATION_SETTLED',
      'MobilityCancellationSettlement',
      settlement.id,
      'STAFF',
      dto.settledBy,
      tripId,
      {
        passengerChargeAmount,
        driverCompensationAmount,
        platformAmount,
      },
    );

    return settlement;
  }

  async queueNotification(dto: QueueNotificationDto) {
    return this.prisma.mobilityNotificationOutbox.upsert({
      where: { idempotencyKey: dto.idempotencyKey },
      update: {},
      create: {
        idempotencyKey: dto.idempotencyKey,
        userId: dto.userId,
        driverId: dto.driverId,
        tripId: dto.tripId,
        channel: dto.channel,
        destination: dto.destination,
        template: dto.template,
        payload: {
          note: 'Outbox Ãºnicamente. El envÃ­o real requiere proveedor SMS/push/email.',
        },
      },
    });
  }

  async pendingNotifications(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.prisma.mobilityNotificationOutbox.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: safeLimit,
    });
  }

  async markNotification(id: string, dto: MarkNotificationDto) {
    const row = await this.prisma.mobilityNotificationOutbox.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('NotificaciÃ³n no encontrada.');

    return this.prisma.mobilityNotificationOutbox.update({
      where: { id },
      data: {
        status: dto.status,
        attempts: { increment: 1 },
        lastError: dto.status === 'FAILED' ? (dto.error ?? 'UNKNOWN') : null,
        sentAt: dto.status === 'SENT' ? new Date() : null,
      },
    });
  }

  async escalateSafety(incidentId: string, dto: EscalateSafetyDto) {
    const incident = await this.prisma.mobilitySafetyIncident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('Incidente no encontrado.');

    // La creaciÃ³n de esta fila NO representa una llamada real a policÃ­a/911.
    // Solo documenta y prepara el flujo de escalamiento.
    const escalation = await this.prisma.mobilitySafetyEscalation.create({
      data: {
        incidentId,
        step: dto.step,
        status: 'RECORDED',
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
        executedAt: new Date(),
      },
    });

    await this.audit(
      'SAFETY_ESCALATION_RECORDED',
      'MobilitySafetyIncident',
      incidentId,
      'SYSTEM',
      undefined,
      incident.tripId ?? undefined,
      { step: dto.step, escalationId: escalation.id },
    );

    return {
      escalation,
      realWorldActionPerformed: false,
      warning:
        'Registro interno Ãºnicamente; no confirma contacto con servicios de emergencia.',
    };
  }

  async createPrivacyPolicy(dto: CreatePrivacyPolicyDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.mobilityPrivacyPolicy.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return tx.mobilityPrivacyPolicy.create({
        data: {
          name: dto.name,
          locationRetentionDays: dto.locationRetentionDays ?? 30,
          heartbeatRetentionDays: dto.heartbeatRetentionDays ?? 30,
          incidentRetentionDays: dto.incidentRetentionDays ?? 365,
          preciseLocationPurpose: dto.preciseLocationPurpose,
        },
      });
    });
  }

  async privacyCleanupPreview() {
    const policy =
      (await this.prisma.mobilityPrivacyPolicy.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      })) ??
      ({
        locationRetentionDays: 30,
        heartbeatRetentionDays: 30,
        incidentRetentionDays: 365,
      } as const);

    const now = Date.now();
    const locationBefore = new Date(
      now - policy.locationRetentionDays * 86400000,
    );
    const heartbeatBefore = new Date(
      now - policy.heartbeatRetentionDays * 86400000,
    );

    const [locationRows, heartbeatRows] = await Promise.all([
      this.prisma.mobilityLocationTrace.count({
        where: { createdAt: { lt: locationBefore } },
      }),
      this.prisma.mobilityDeviceHeartbeat.count({
        where: { createdAt: { lt: heartbeatBefore } },
      }),
    ]);

    return {
      policy,
      cutoffs: { locationBefore, heartbeatBefore },
      candidates: { locationRows, heartbeatRows },
      deleted: false,
    };
  }

  async privacyCleanup(dto: PrivacyCleanupDto) {
    if (!dto.confirm) {
      throw new BadRequestException(
        'Debes enviar confirm=true. Usa primero el preview.',
      );
    }

    const policy =
      (await this.prisma.mobilityPrivacyPolicy.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      })) ??
      ({
        locationRetentionDays: 30,
        heartbeatRetentionDays: 30,
      } as const);

    const now = Date.now();
    const locationBefore = new Date(
      now - policy.locationRetentionDays * 86400000,
    );
    const heartbeatBefore = new Date(
      now - policy.heartbeatRetentionDays * 86400000,
    );

    // Conserva trazas ligadas a incidentes de seguridad abiertos.
    const openIncidentTripIds = (
      await this.prisma.mobilitySafetyIncident.findMany({
        where: {
          status: { not: 'RESOLVED' },
          tripId: { not: null },
        },
        select: { tripId: true },
      })
    )
      .map((x) => x.tripId)
      .filter((x): x is string => Boolean(x));

    const [locationDelete, heartbeatDelete] = await this.prisma.$transaction([
      this.prisma.mobilityLocationTrace.deleteMany({
        where: {
          createdAt: { lt: locationBefore },
          ...(openIncidentTripIds.length
            ? { tripId: { notIn: openIncidentTripIds } }
            : {}),
        },
      }),
      this.prisma.mobilityDeviceHeartbeat.deleteMany({
        where: {
          createdAt: { lt: heartbeatBefore },
          ...(openIncidentTripIds.length
            ? {
                OR: [
                  { tripId: null },
                  { tripId: { notIn: openIncidentTripIds } },
                ],
              }
            : {}),
        },
      }),
    ]);

    await this.audit(
      'PRIVACY_CLEANUP_EXECUTED',
      'MobilityPrivacyPolicy',
      undefined,
      'SYSTEM',
      undefined,
      undefined,
      {
        locationDeleted: locationDelete.count,
        heartbeatDeleted: heartbeatDelete.count,
      },
    );

    return {
      locationDeleted: locationDelete.count,
      heartbeatDeleted: heartbeatDelete.count,
      preservedOpenIncidentTrips: openIncidentTripIds.length,
    };
  }

  async createPayout(dto: CreatePayoutDto) {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('Periodo invÃ¡lido.');
    }

    const wallet = await this.prisma.mobilityDriverWallet.findUnique({
      where: { driverId: dto.driverId },
    });
    if (!wallet) throw new NotFoundException('Cartera no encontrada.');

    const movements = await this.prisma.mobilityWalletMovement.findMany({
      where: {
        driverId: dto.driverId,
        createdAt: { gte: start, lte: end },
        amount: { gt: 0 },
      },
    });

    const amount = this.money(
      movements.reduce((sum, row) => sum + row.amount, 0),
    );

    if (amount <= 0) {
      throw new BadRequestException('No hay saldo del periodo para liquidar.');
    }

    const reference = `PAY-${dto.driverId.slice(0, 8)}-${start
      .toISOString()
      .slice(0, 10)}-${end.toISOString().slice(0, 10)}`;

    return this.prisma.mobilityPayoutBatch.upsert({
      where: { reference },
      update: {},
      create: {
        driverId: dto.driverId,
        amount,
        periodStart: start,
        periodEnd: end,
        reference,
        notes: dto.notes,
      },
    });
  }

  async auditTrail(tripId: string) {
    return this.prisma.mobilityAuditEvent.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
