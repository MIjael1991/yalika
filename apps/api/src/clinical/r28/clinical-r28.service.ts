import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthContext } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalService } from '../clinical.service';
import {
  createConsultationDraft,
  createRegimenDraft,
  createTemporaryConsultationLink,
  canUseConsultationLink,
  hashConsultationToken,
  applyDispenseToRegimen,
} from './clinical-r28.domain';
import {
  consultationIntegrationEvent,
  medicationSupplyIntegrationEvent,
} from './clinical-r28.integration';
import type {
  CreateClinicalConsultationDto,
  CreateClinicalConsultationLinkDto,
} from './dto/create-consultation.dto';
import type {
  CreateClinicalRegimenDto,
  DispenseClinicalRegimenDto,
} from './dto/regimen.dto';
import type {
  CreateConsultationPrescriptionDto,
  ConsultationPrescriptionItemDto,
} from './dto/professional-prescription.dto';

@Injectable()
export class ClinicalR28Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legacyClinical: ClinicalService,
  ) {}

  private async profileForOwner(ownerUserId: string) {
    return this.prisma.clinicalProfile.upsert({
      where: { ownerUserId },
      update: {},
      create: { ownerUserId },
    });
  }

  private async requireOwnerConsultation(ownerUserId: string, id: string) {
    const profile = await this.profileForOwner(ownerUserId);
    const consultation = await this.prisma.clinicalConsultation.findFirst({
      where: {
        id,
        clinicalProfileId: profile.id,
      },
    });
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }
    return { profile, consultation };
  }

  private async audit(input: {
    profileId: string;
    actorUserId: string;
    action: string;
    result?: 'ALLOWED' | 'DENIED' | 'RECORDED';
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.clinicalAuditEvent.create({
      data: {
        profileId: input.profileId,
        actorUserId: input.actorUserId,
        action: input.action,
        result: input.result ?? 'RECORDED',
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: (input.metadata ?? undefined) as any,
      },
    });
  }

  private integrationData(event: {
    type: string;
    userId: string;
    sourceId: string;
    dueAt?: string;
    title: string;
    sensitivity: 'PRIVATE';
    metadata: Record<string, string | number | boolean | null>;
    dedupeKey: string;
    status: 'pending';
  }) {
    return {
      eventType: event.type,
      userId: event.userId,
      sourceId: event.sourceId,
      dueAt: event.dueAt ? new Date(event.dueAt) : null,
      title: event.title,
      sensitivity: event.sensitivity,
      metadata: event.metadata as any,
      dedupeKey: event.dedupeKey,
      status: event.status,
    };
  }

  async listConsultations(auth: AuthContext) {
    const profile = await this.profileForOwner(auth.user.id);
    const rows = await this.prisma.clinicalConsultation.findMany({
      where: {
        OR: [
          { clinicalProfileId: profile.id },
          { patientUserId: auth.user.id },
          { clinicianUserId: auth.user.id },
        ],
      },
      include: {
        links: {
          where: { revokedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      ...row,
      viewerRole:
        row.clinicianUserId === auth.user.id
          ? 'CLINICIAN'
          : row.patientUserId === auth.user.id ||
              row.clinicalProfileId === profile.id
            ? 'PATIENT'
            : 'VIEWER',
    }));
  }

  async createConsultation(
    auth: AuthContext,
    dto: CreateClinicalConsultationDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);

    let clinicianUserId: string | null = null;
    if (dto.clinicianEmail?.trim()) {
      const clinician = await this.prisma.user.findFirst({
        where: {
          email: dto.clinicianEmail.trim().toLowerCase(),
        },
        select: { id: true },
      });
      if (!clinician) {
        throw new BadRequestException(
          'No encontré una cuenta Yalika con ese correo profesional',
        );
      }
      clinicianUserId = clinician.id;
    }

    const draft = createConsultationDraft({
      clinicalProfileId: profile.id,
      patientUserId: auth.user.id,
      clinicianUserId,
      subjectType: dto.subjectType,
      mode: dto.mode,
      scheduledAt: dto.scheduledAt,
      reason: dto.reason,
      configuredPriceCents: dto.configuredPriceCents,
    });

    return this.prisma.$transaction(async (tx: any) => {
      const consultation = await tx.clinicalConsultation.create({
        data: draft,
      });

      await tx.clinicalTimelineEvent.create({
        data: {
          profileId: profile.id,
          kind: dto.mode === 'follow_up' ? 'FOLLOW_UP' : 'APPOINTMENT',
          title:
            dto.mode === 'online'
              ? 'Consulta en línea'
              : dto.mode === 'presential'
                ? 'Consulta presencial'
                : 'Seguimiento clínico',
          status: 'SCHEDULED',
          occurredAt: new Date(dto.scheduledAt),
          resourceType: 'CONSULTATION',
          resourceId: consultation.id,
          source: 'PATIENT',
          verificationStatus: 'UNVERIFIED',
          createdByUserId: auth.user.id,
        },
      });

      const event = consultationIntegrationEvent({
        userId: auth.user.id,
        consultationId: consultation.id,
        startsAt: new Date(dto.scheduledAt).toISOString(),
      });

      await tx.clinicalIntegrationEvent.create({
        data: this.integrationData(event),
      });

      await tx.clinicalAuditEvent.create({
        data: {
          profileId: profile.id,
          actorUserId: auth.user.id,
          action: 'clinical.consultation.created',
          result: 'RECORDED',
          resourceType: 'CONSULTATION',
          resourceId: consultation.id,
          metadata: {
            mode: dto.mode,
            subjectType: dto.subjectType,
            priceCents: consultation.priceCents,
            clinicianAssigned: Boolean(clinicianUserId),
          },
        },
      });

      return consultation;
    });
  }

  async createConsultationLink(
    auth: AuthContext,
    consultationId: string,
    dto: CreateClinicalConsultationLinkDto,
  ) {
    const { profile } = await this.requireOwnerConsultation(
      auth.user.id,
      consultationId,
    );

    const generated = createTemporaryConsultationLink({
      consultationId,
      ttlMinutes: dto.ttlMinutes,
      maxUses: dto.maxUses ?? 20,
    });

    const record = await this.prisma.clinicalConsultationLink.create({
      data: {
        ...generated.record,
        createdById: auth.user.id,
      },
      select: {
        id: true,
        consultationId: true,
        purpose: true,
        expiresAt: true,
        maxUses: true,
        useCount: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.consultation.link_created',
      resourceType: 'CONSULTATION_LINK',
      resourceId: record.id,
      metadata: { consultationId, maxUses: record.maxUses },
    });

    return {
      link: record,
      token: generated.token,
      relativePath: `/salud/consulta?token=${encodeURIComponent(generated.token)}`,
    };
  }

  async revokeConsultationLinks(auth: AuthContext, consultationId: string) {
    const { profile } = await this.requireOwnerConsultation(
      auth.user.id,
      consultationId,
    );

    const result = await this.prisma.clinicalConsultationLink.updateMany({
      where: {
        consultationId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.consultation.links_revoked',
      resourceType: 'CONSULTATION',
      resourceId: consultationId,
      metadata: { revokedCount: result.count },
    });

    return { revoked: result.count };
  }

  async accessConsultation(auth: AuthContext, token: string) {
    const tokenHash = hashConsultationToken(token);
    const link = await this.prisma.clinicalConsultationLink.findUnique({
      where: { tokenHash },
      include: { consultation: true },
    });

    if (
      !link ||
      !canUseConsultationLink({
        expiresAt: link.expiresAt,
        revokedAt: link.revokedAt,
        maxUses: link.maxUses,
        useCount: link.useCount,
      })
    ) {
      throw new NotFoundException('El enlace de consulta no está disponible');
    }

    const consultation = link.consultation;
    const viewerRole =
      consultation.clinicianUserId === auth.user.id
        ? 'CLINICIAN'
        : consultation.patientUserId === auth.user.id
          ? 'PATIENT'
          : 'INVITED';

    await this.prisma.clinicalConsultationLink.update({
      where: { id: link.id },
      data: { useCount: { increment: 1 } },
    });

    const regimens = await this.regimensForConsultation(
      consultation.clinicalProfileId,
      consultation.id,
    );

    return {
      consultation,
      viewerRole,
      regimens,
      privacy:
        'El enlace sólo abre esta consulta. No concede acceso general al expediente.',
    };
  }

  async listRegimens(auth: AuthContext) {
    const profile = await this.profileForOwner(auth.user.id);
    const regimens = await this.prisma.clinicalMedicationRegimen.findMany({
      where: { clinicalProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      include: {
        dispenses: {
          orderBy: { dispensedAt: 'desc' },
          take: 20,
        },
      },
      take: 200,
    });

    return this.enrichRegimens(regimens);
  }

  private async regimensForConsultation(
    profileId: string,
    consultationId: string,
  ) {
    const rows = await this.prisma.clinicalMedicationRegimen.findMany({
      where: {
        clinicalProfileId: profileId,
        consultationId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        dispenses: {
          orderBy: { dispensedAt: 'desc' },
          take: 20,
        },
      },
    });
    return this.enrichRegimens(rows);
  }

  private async enrichRegimens(regimens: any[]) {
    const itemIds = [
      ...new Set(
        regimens
          .map((row) => row.prescriptionItemId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const items = itemIds.length
      ? await this.prisma.clinicalPrescriptionItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            medicationName: true,
            strength: true,
            form: true,
          },
        })
      : [];

    const byId = new Map(items.map((item) => [item.id, item]));

    return regimens.map((row) => ({
      ...row,
      medication: row.prescriptionItemId
        ? byId.get(row.prescriptionItemId) ?? null
        : null,
      packagesToCoverRemaining:
        row.packageUnits && row.remainingUnits > 0
          ? Math.ceil(row.remainingUnits / row.packageUnits)
          : row.remainingUnits <= 0
            ? 0
            : null,
    }));
  }

  async createRegimen(auth: AuthContext, dto: CreateClinicalRegimenDto) {
    const profile = await this.profileForOwner(auth.user.id);

    const item = await this.prisma.clinicalPrescriptionItem.findFirst({
      where: {
        id: dto.prescriptionItemId,
        prescriptionId: dto.prescriptionId,
        prescription: {
          profileId: profile.id,
        },
      },
      include: {
        prescription: true,
      },
    });

    if (!item) {
      throw new BadRequestException(
        'La receta o medicamento no pertenece a tu expediente',
      );
    }

    const draft = createRegimenDraft({
      clinicalProfileId: profile.id,
      prescriptionId: dto.prescriptionId,
      prescriptionItemId: dto.prescriptionItemId,
      instructions: dto.instructions,
      doseAmount: dto.doseAmount,
      doseUnit: dto.doseUnit,
      administrationsPerDay: dto.administrationsPerDay,
      durationDays: dto.durationDays,
      firstDoseAt: dto.firstDoseAt,
    });

    const created = await this.prisma.clinicalMedicationRegimen.create({
      data: {
        clinicalProfileId: draft.clinicalProfileId,
        prescriptionId: draft.prescriptionId,
        prescriptionItemId: draft.prescriptionItemId,
        instructions: draft.instructions,
        doseAmount: draft.doseAmount,
        doseUnit: draft.doseUnit,
        administrationsPerDay: draft.administrationsPerDay,
        durationDays: draft.durationDays,
        requiredUnits: draft.requiredUnits,
        dispensedUnits: draft.dispensedUnits,
        remainingUnits: draft.remainingUnits,
        packageUnits: draft.packageUnits,
        supplyStatus: draft.supplyStatus,
        firstDoseAt: draft.firstDoseAt,
        timezone: draft.timezone,
        createdById: auth.user.id,
      },
    });

    if (created.remainingUnits > 0) {
      const event = medicationSupplyIntegrationEvent({
        userId: auth.user.id,
        prescriptionItemId: dto.prescriptionItemId,
        remainingUnits: created.remainingUnits,
      });
      await this.prisma.clinicalIntegrationEvent.upsert({
        where: { dedupeKey: event.dedupeKey },
        update: {},
        create: this.integrationData(event),
      });
    }

    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.medication.regimen_created',
      resourceType: 'MEDICATION_REGIMEN',
      resourceId: created.id,
      metadata: {
        requiredUnits: created.requiredUnits,
        packageUnits: created.packageUnits,
      },
    });

    return {
      regimen: created,
      calculation: draft.commercialProjection,
    };
  }

  async dispense(
    auth: AuthContext,
    regimenId: string,
    dto: DispenseClinicalRegimenDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);
    const regimen = await this.prisma.clinicalMedicationRegimen.findFirst({
      where: {
        id: regimenId,
        clinicalProfileId: profile.id,
      },
    });
    if (!regimen) {
      throw new NotFoundException('Pauta no encontrada');
    }

    const previous = await this.prisma.clinicalDispenseEvent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (previous) {
      return { idempotent: true, dispense: previous, regimen };
    }

    const result = applyDispenseToRegimen({
      requiredUnits: regimen.requiredUnits,
      currentDispensedUnits: regimen.dispensedUnits,
      currentRemainingUnits: regimen.remainingUnits,
      packageUnits: dto.packageUnits ?? regimen.packageUnits,
      packagesPresented: dto.packagesPresented,
      looseUnitsPresented: dto.looseUnitsPresented,
    });

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const dispense = await tx.clinicalDispenseEvent.create({
        data: {
          regimenId: regimen.id,
          quantityPresented: result.quantityPresented,
          packageUnits: dto.packageUnits ?? regimen.packageUnits,
          packagesPresented: dto.packagesPresented ?? null,
          prescriptionUnitsCovered: result.prescriptionUnitsCovered,
          surplusUnits: result.surplusUnits,
          providerUserId: auth.user.id,
          providerName: dto.providerName?.trim() || null,
          idempotencyKey: dto.idempotencyKey,
        },
      });

      const nextRegimen = await tx.clinicalMedicationRegimen.update({
        where: { id: regimen.id },
        data: {
          dispensedUnits: result.newDispensedUnits,
          remainingUnits: result.newRemainingUnits,
          packageUnits: dto.packageUnits ?? regimen.packageUnits,
          supplyStatus: result.supplyStatus,
        },
      });

      await tx.clinicalIntegrationEvent.updateMany({
        where: {
          sourceId: regimen.prescriptionItemId ?? regimen.id,
          eventType: 'clinical.medication.supply.pending',
          status: 'pending',
        },
        data: { status: 'cancelled' },
      });

      if (result.newRemainingUnits > 0) {
        const sourceId = regimen.prescriptionItemId ?? regimen.id;
        const event = medicationSupplyIntegrationEvent({
          userId: auth.user.id,
          prescriptionItemId: sourceId,
          remainingUnits: result.newRemainingUnits,
        });
        await tx.clinicalIntegrationEvent.upsert({
          where: { dedupeKey: event.dedupeKey },
          update: { status: 'pending', deliveredAt: null },
          create: this.integrationData(event),
        });
      }

      await tx.clinicalAuditEvent.create({
        data: {
          profileId: profile.id,
          actorUserId: auth.user.id,
          action: 'clinical.medication.dispensed',
          result: 'RECORDED',
          resourceType: 'MEDICATION_REGIMEN',
          resourceId: regimen.id,
          metadata: {
            quantityPresented: result.quantityPresented,
            prescriptionUnitsCovered: result.prescriptionUnitsCovered,
            surplusUnits: result.surplusUnits,
            remainingUnits: result.newRemainingUnits,
          },
        },
      });

      return { dispense, regimen: nextRegimen };
    });

    return {
      ...updated,
      calculation: result,
    };
  }

  async issueConsultationPrescription(
    auth: AuthContext,
    consultationId: string,
    dto: CreateConsultationPrescriptionDto,
  ) {
    if (!dto.items.length) {
      throw new BadRequestException('Agrega al menos un medicamento');
    }

    const consultation = await this.prisma.clinicalConsultation.findFirst({
      where: {
        id: consultationId,
        clinicianUserId: auth.user.id,
        status: { in: ['scheduled', 'active', 'completed'] },
      },
    });

    if (!consultation) {
      throw new ForbiddenException(
        'Esta consulta no está asignada a tu cuenta como profesional',
      );
    }

    const professional = await this.prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { name: true },
    });

    const created = await this.prisma.$transaction(async (tx: any) => {
      const prescription = await tx.clinicalPrescription.create({
        data: {
          profileId: consultation.clinicalProfileId,
          source: 'PROFESSIONAL_ENTERED',
          verificationStatus: 'UNVERIFIED',
          status: 'ACTIVE',
          prescriberName: professional?.name ?? 'Profesional Yalika',
          institutionName: dto.institutionName?.trim() || null,
          issuedAt: new Date(dto.issuedAt),
          createdByUserId: auth.user.id,
          items: {
            create: dto.items.map((item, index) => ({
              medicationName: item.medicationName.trim(),
              strength: item.strength?.trim() || null,
              form: item.form?.trim() || null,
              route: item.route?.trim() || null,
              dosageText: item.dosageText?.trim() || null,
              frequencyText: item.frequencyText?.trim() || null,
              durationText: item.durationText?.trim() || null,
              quantityText: item.quantityText?.trim() || null,
              instructions: item.instructions?.trim() || null,
              sortOrder: index,
            })),
          },
        },
        include: { items: true },
      });

      await tx.clinicalTimelineEvent.create({
        data: {
          profileId: consultation.clinicalProfileId,
          kind: 'PRESCRIPTION',
          title: `Receta de consulta · ${dto.items.length} elemento(s)`,
          status: 'COMPLETED',
          occurredAt: new Date(dto.issuedAt),
          resourceType: 'PRESCRIPTION',
          resourceId: prescription.id,
          source: 'PROFESSIONAL',
          verificationStatus: 'UNVERIFIED',
          createdByUserId: auth.user.id,
        },
      });

      const regimenResults: any[] = [];
      for (let index = 0; index < dto.items.length; index += 1) {
        const inputItem = dto.items[index];
        const createdItem = prescription.items[index];

        if (this.hasCompleteStructuredDose(inputItem)) {
          const draft = createRegimenDraft({
            clinicalProfileId: consultation.clinicalProfileId,
            consultationId: consultation.id,
            prescriptionId: prescription.id,
            prescriptionItemId: createdItem.id,
            instructions:
              inputItem.instructions?.trim() ||
              inputItem.dosageText?.trim() ||
              'Indicación registrada por el profesional',
            doseAmount: inputItem.doseAmount!,
            doseUnit: inputItem.doseUnit!,
            administrationsPerDay: inputItem.administrationsPerDay!,
            durationDays: inputItem.durationDays!,
          });

          const regimen = await tx.clinicalMedicationRegimen.create({
            data: {
              clinicalProfileId: draft.clinicalProfileId,
              consultationId: draft.consultationId,
              prescriptionId: draft.prescriptionId,
              prescriptionItemId: draft.prescriptionItemId,
              instructions: draft.instructions,
              doseAmount: draft.doseAmount,
              doseUnit: draft.doseUnit,
              administrationsPerDay: draft.administrationsPerDay,
              durationDays: draft.durationDays,
              requiredUnits: draft.requiredUnits,
              dispensedUnits: draft.dispensedUnits,
              remainingUnits: draft.remainingUnits,
              packageUnits: draft.packageUnits,
              supplyStatus: draft.supplyStatus,
              timezone: draft.timezone,
              createdById: auth.user.id,
            },
          });
          regimenResults.push({
            regimen,
            calculation: draft.commercialProjection,
          });

          const patientUserId = consultation.patientUserId;
          if (patientUserId && regimen.remainingUnits > 0) {
            const event = medicationSupplyIntegrationEvent({
              userId: patientUserId,
              prescriptionItemId: createdItem.id,
              remainingUnits: regimen.remainingUnits,
            });
            await tx.clinicalIntegrationEvent.upsert({
              where: { dedupeKey: event.dedupeKey },
              update: {},
              create: this.integrationData(event),
            });
          }
        }
      }

      await tx.clinicalAuditEvent.create({
        data: {
          profileId: consultation.clinicalProfileId,
          actorUserId: auth.user.id,
          action: 'clinical.consultation.prescription_created',
          result: 'RECORDED',
          resourceType: 'PRESCRIPTION',
          resourceId: prescription.id,
          metadata: {
            consultationId: consultation.id,
            itemCount: dto.items.length,
            structuredRegimens: regimenResults.length,
            credentialsVerifiedByYalika: false,
          },
        },
      });

      return { prescription, regimenResults };
    });

    return {
      ...created,
      warning:
        'La receta fue registrada por la cuenta profesional asignada, pero Yalika aún no verifica credenciales profesionales en esta fase.',
    };
  }

  private hasCompleteStructuredDose(item: ConsultationPrescriptionItemDto) {
    const provided = [
      item.doseAmount,
      item.doseUnit,
      item.administrationsPerDay,
      item.durationDays,
    ];

    const any = provided.some(
      (value) => value !== undefined && value !== null && value !== '',
    );
    const all = provided.every(
      (value) => value !== undefined && value !== null && value !== '',
    );

    if (any && !all) {
      throw new BadRequestException(
        'Para calcular cantidad/presentación completa dosis, unidad, tomas por día y duración; o deja todos esos campos vacíos.',
      );
    }
    return all;
  }

  async assistantContext(ownerUserId: string, query: string) {
    const profile = await this.profileForOwner(ownerUserId);
    const normalized = query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    const wantsConsultations =
      normalized.includes('consulta') ||
      normalized.includes('cita') ||
      normalized.includes('doctor') ||
      normalized.includes('veterin');

    const wantsSupply =
      normalized.includes('falta') ||
      normalized.includes('surt') ||
      normalized.includes('medicamento') ||
      normalized.includes('caja') ||
      normalized.includes('comprar');

    const sources: Array<Record<string, unknown>> = [];
    const notes: string[] = [];

    if (wantsConsultations) {
      const consultations = await this.prisma.clinicalConsultation.findMany({
        where: {
          clinicalProfileId: profile.id,
          status: { in: ['scheduled', 'active'] },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 8,
      });

      for (const item of consultations) {
        sources.push({
          type: 'CONSULTATION',
          id: item.id,
          title:
            item.mode === 'online'
              ? 'Consulta en línea'
              : item.mode === 'presential'
                ? 'Consulta presencial'
                : 'Seguimiento',
          date: item.scheduledAt,
          status: item.status,
        });
      }
      if (consultations.length) {
        notes.push(
          `Tienes ${consultations.length} consulta(s) programada(s) o activa(s).`,
        );
      }
    }

    if (wantsSupply) {
      const pending = await this.prisma.clinicalMedicationRegimen.findMany({
        where: {
          clinicalProfileId: profile.id,
          supplyStatus: { in: ['PENDING', 'PARTIALLY_FILLED'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      });

      const enriched = await this.enrichRegimens(pending);
      for (const item of enriched) {
        sources.push({
          type: 'MEDICATION_SUPPLY',
          id: item.id,
          title: item.medication?.medicationName ?? 'Medicamento',
          remainingUnits: item.remainingUnits,
          packageUnits: item.packageUnits,
          packagesToCoverRemaining: item.packagesToCoverRemaining,
          status: item.supplyStatus,
        });
      }
      if (pending.length) {
        notes.push(
          `Hay ${pending.length} medicamento(s) con surtido pendiente o parcial.`,
        );
      }
    }

    return {
      message: notes.join(' ') || '',
      sources,
    };
  }

  async combinedAssistant(auth: AuthContext, query: string) {
    const [base, extra] = await Promise.all([
      this.legacyClinical.assistant(auth.user.id, query),
      this.assistantContext(auth.user.id, query),
    ]);

    const allSources = [
      ...(Array.isArray((base as any).sources) ? (base as any).sources : []),
      ...extra.sources,
    ];

    const uniqueSources = Array.from(
      new Map(
        allSources.map((source: any) => [
          `${source.type}:${source.id}`,
          source,
        ]),
      ).values(),
    ).slice(0, 20);

    return {
      ...(base as any),
      message: extra.message
        ? `${extra.message} ${(base as any).message ?? ''}`.trim()
        : (base as any).message,
      sources: uniqueSources,
    };
  }
}
