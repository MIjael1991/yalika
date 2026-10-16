import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthContext } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalStorageService } from '../clinical-storage.service';
import { createOpaqueToken, sha256, tokenPrefix } from '../clinical.utils';
import { ClinicalR28Service } from '../r28/clinical-r28.service';
import {
  advanceMedicationSchedule,
  buildSimpleDoctorSummaryLines,
  deriveMedicationSchedule,
  normalizeHealthCategories,
  proposeVisitExtraction,
} from './clinical-r29.domain';
import type {
  ChangeMedicationScheduleDto,
  ConfirmVisitCaptureDto,
  CreateAllergyDto,
  CreateCaregiverGrantDto,
  CreateFollowUpProposalDto,
  CreateHealthQrDto,
  CreateMedicationScheduleDto,
  CreateProcedureDto,
  CreateRestrictionDto,
  CreateVisitCaptureDto,
  DoctorSummaryDto,
  RecordMedicationDoseDto,
  SyncBatchDto,
} from './dto/r29.dto';

@Injectable()
export class ClinicalR29Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
    private readonly r28: ClinicalR28Service,
  ) {}

  private async profileForOwner(ownerUserId: string) {
    return this.prisma.clinicalProfile.upsert({
      where: { ownerUserId },
      update: {},
      create: { ownerUserId },
    });
  }

  private async audit(input: {
    profileId: string;
    actorUserId: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    result?: 'ALLOWED' | 'DENIED' | 'RECORDED';
    grantId?: string;
    operationId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.clinicalAuditEvent.create({
      data: {
        profileId: input.profileId,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        result: input.result ?? 'RECORDED',
        grantId: input.grantId,
        operationId: input.operationId,
        metadata: (input.metadata ?? undefined) as any,
      },
    });
  }

  private async assertOwnedDocument(profileId: string, documentId?: string) {
    if (!documentId) return null;
    const document = await this.prisma.clinicalDocument.findFirst({
      where: { id: documentId, profileId, deletedAt: null },
    });
    if (!document)
      throw new BadRequestException('El documento no pertenece al expediente');
    return document;
  }

  private async recordReceipt(input: {
    operationId?: string;
    profileId: string;
    actorUserId: string;
    operationType: string;
    resourceType?: string;
    resourceId?: string;
  }) {
    if (!input.operationId) return;
    await this.prisma.clinicalOperationReceipt.upsert({
      where: { operationId: input.operationId },
      update: {},
      create: {
        operationId: input.operationId,
        clinicalProfileId: input.profileId,
        actorUserId: input.actorUserId,
        operationType: input.operationType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    });
  }

  async overview(auth: AuthContext) {
    const profile = await this.profileForOwner(auth.user.id);
    const now = new Date();

    const [
      allergies,
      restrictions,
      schedules,
      consultations,
      events,
      documents,
      procedures,
      followUps,
      activeSessions,
    ] = await Promise.all([
      this.prisma.clinicalAllergy.findMany({
        where: { clinicalProfileId: profile.id, active: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.clinicalRestriction.findMany({
        where: { clinicalProfileId: profile.id, active: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.clinicalMedicationSchedule.findMany({
        where: { clinicalProfileId: profile.id, status: 'ACTIVE' },
        orderBy: { nextDoseAt: 'asc' },
        take: 100,
      }),
      this.prisma.clinicalConsultation.findMany({
        where: {
          clinicalProfileId: profile.id,
          status: { in: ['scheduled', 'active'] },
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      }),
      this.prisma.clinicalTimelineEvent.findMany({
        where: { profileId: profile.id },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      }),
      this.prisma.clinicalDocument.findMany({
        where: { profileId: profile.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.clinicalProcedure.findMany({
        where: { clinicalProfileId: profile.id },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      }),
      this.prisma.clinicalFollowUpProposal.findMany({
        where: { clinicalProfileId: profile.id, status: 'PROPOSED' },
        orderBy: { targetAt: 'asc' },
        take: 20,
      }),
      this.prisma.clinicalAccessSession.findMany({
        where: {
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { gt: now },
          grant: { profileId: profile.id, status: 'ACTIVE', revokedAt: null },
        },
        orderBy: { lastUsedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          viewerUserId: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          grantId: true,
        },
      }),
    ]);

    const enrichedSchedules = await this.enrichSchedules(schedules);

    return {
      important: {
        allergies,
        restrictions,
        currentMedications: enrichedSchedules,
      },
      today: {
        nextMedication:
          enrichedSchedules.find((item) => item.nextDoseAt) ?? null,
        nextConsultation: consultations[0] ?? null,
      },
      recent: {
        events,
        documents,
        procedures,
      },
      followUpProposals: followUps,
      activeAccessSessions: activeSessions,
      offline: {
        idempotentSync: true,
        remoteQrRequiresConnection: true,
      },
    };
  }

  private async enrichSchedules(schedules: any[]) {
    const regimenIds = schedules.map((item) => item.regimenId);
    const regimens = regimenIds.length
      ? await this.prisma.clinicalMedicationRegimen.findMany({
          where: { id: { in: regimenIds } },
        })
      : [];
    const itemIds = regimens
      .map((item) => item.prescriptionItemId)
      .filter((id): id is string => Boolean(id));
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
    const regimenById = new Map(regimens.map((item) => [item.id, item]));
    const itemById = new Map(items.map((item) => [item.id, item]));

    return Promise.all(
      schedules.map(async (schedule) => {
        const regimen = regimenById.get(schedule.regimenId) ?? null;
        const medication = regimen?.prescriptionItemId
          ? (itemById.get(regimen.prescriptionItemId) ?? null)
          : null;
        const counts =
          await this.prisma.clinicalMedicationAdministration.groupBy({
            by: ['status'],
            where: { scheduleId: schedule.id },
            _count: { _all: true },
          });
        return {
          ...schedule,
          regimen,
          medication,
          taken: counts.find((c) => c.status === 'TAKEN')?._count._all ?? 0,
          omitted: counts.find((c) => c.status === 'OMITTED')?._count._all ?? 0,
        };
      }),
    );
  }

  async createCapture(auth: AuthContext, dto: CreateVisitCaptureDto) {
    const profile = await this.profileForOwner(auth.user.id);
    if (dto.operationId) {
      const existing = await this.prisma.clinicalVisitCapture.findUnique({
        where: { operationId: dto.operationId },
      });
      if (existing) {
        if (existing.clinicalProfileId !== profile.id)
          throw new NotFoundException('Operación no disponible');
        return existing;
      }
    }

    await this.assertOwnedDocument(profile.id, dto.documentId);
    if (dto.consultationId) {
      const consultation = await this.prisma.clinicalConsultation.findFirst({
        where: { id: dto.consultationId, clinicalProfileId: profile.id },
      });
      if (!consultation)
        throw new BadRequestException('La consulta no pertenece al expediente');
    }

    const proposal = proposeVisitExtraction(dto.sourceText);
    const capture = await this.prisma.clinicalVisitCapture.create({
      data: {
        clinicalProfileId: profile.id,
        consultationId: dto.consultationId,
        sourceType: dto.sourceType,
        documentId: dto.documentId,
        sourceText: dto.sourceText?.trim() || null,
        proposedData: proposal as any,
        confirmationStatus: 'PENDING',
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.visit_capture.proposed',
      resourceType: 'VISIT_CAPTURE',
      resourceId: capture.id,
      operationId: dto.operationId,
      metadata: { sourceType: dto.sourceType, requiresConfirmation: true },
    });
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'CAPTURE_CREATE',
      resourceType: 'VISIT_CAPTURE',
      resourceId: capture.id,
    });

    return capture;
  }

  async confirmCapture(
    auth: AuthContext,
    id: string,
    dto: ConfirmVisitCaptureDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);
    const capture = await this.prisma.clinicalVisitCapture.findFirst({
      where: { id, clinicalProfileId: profile.id },
    });
    if (!capture) throw new NotFoundException('Captura no encontrada');

    const status = dto.status ?? 'CONFIRMED';
    const updated = await this.prisma.clinicalVisitCapture.update({
      where: { id },
      data: {
        confirmedData: dto.confirmedData as any,
        confirmationStatus: status,
      },
    });

    if (status !== 'REJECTED') {
      const data = dto.confirmedData as Record<string, any>;
      const occurredAt = data.visitAt
        ? new Date(String(data.visitAt))
        : capture.createdAt;
      await this.prisma.clinicalTimelineEvent.create({
        data: {
          profileId: profile.id,
          kind: 'APPOINTMENT',
          title: String(data.title || 'Consulta guardada'),
          status: 'COMPLETED',
          occurredAt,
          resourceType: 'VISIT_CAPTURE',
          resourceId: capture.id,
          source: 'PATIENT_CONFIRMED',
          verificationStatus: 'UNVERIFIED',
          metadata: dto.confirmedData as any,
          createdByUserId: auth.user.id,
        },
      });
    }

    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.visit_capture.confirmed',
      resourceType: 'VISIT_CAPTURE',
      resourceId: id,
      metadata: { status },
    });
    return updated;
  }

  async createAllergy(auth: AuthContext, dto: CreateAllergyDto) {
    const profile = await this.profileForOwner(auth.user.id);
    if (dto.operationId) {
      const existing = await this.prisma.clinicalAllergy.findUnique({
        where: { operationId: dto.operationId },
      });
      if (existing) {
        if (existing.clinicalProfileId !== profile.id)
          throw new NotFoundException('Operación no disponible');
        return existing;
      }
    }
    await this.assertOwnedDocument(profile.id, dto.sourceDocumentId);
    const allergy = await this.prisma.clinicalAllergy.create({
      data: {
        clinicalProfileId: profile.id,
        substance: dto.substance.trim(),
        allergyType: dto.allergyType,
        reaction: dto.reaction?.trim() || null,
        severity: dto.severity ?? 'UNSPECIFIED',
        approximateDate: dto.approximateDate
          ? new Date(dto.approximateDate)
          : null,
        source: dto.source ?? 'PATIENT',
        confirmationStatus: dto.confirmationStatus ?? 'REPORTED',
        sourceDocumentId: dto.sourceDocumentId,
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.allergy.recorded',
      resourceType: 'ALLERGY',
      resourceId: allergy.id,
      operationId: dto.operationId,
    });
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'ALLERGY_CREATE',
      resourceType: 'ALLERGY',
      resourceId: allergy.id,
    });
    return allergy;
  }

  async deactivateAllergy(auth: AuthContext, id: string) {
    const profile = await this.profileForOwner(auth.user.id);
    const result = await this.prisma.clinicalAllergy.updateMany({
      where: { id, clinicalProfileId: profile.id, active: true },
      data: { active: false },
    });
    if (result.count !== 1)
      throw new NotFoundException('Alergia no encontrada');
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.allergy.deactivated',
      resourceType: 'ALLERGY',
      resourceId: id,
    });
    return { id, active: false };
  }

  async createRestriction(auth: AuthContext, dto: CreateRestrictionDto) {
    const profile = await this.profileForOwner(auth.user.id);
    if (dto.operationId) {
      const existing = await this.prisma.clinicalRestriction.findUnique({
        where: { operationId: dto.operationId },
      });
      if (existing) {
        if (existing.clinicalProfileId !== profile.id)
          throw new NotFoundException('Operación no disponible');
        return existing;
      }
    }
    await this.assertOwnedDocument(profile.id, dto.sourceDocumentId);
    const restriction = await this.prisma.clinicalRestriction.create({
      data: {
        clinicalProfileId: profile.id,
        itemName: dto.itemName.trim(),
        restrictionType: dto.restrictionType,
        reactionOrReason: dto.reactionOrReason?.trim() || null,
        source: dto.source ?? 'PATIENT',
        confirmationStatus: dto.confirmationStatus ?? 'REPORTED',
        sourceDocumentId: dto.sourceDocumentId,
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.restriction.recorded',
      resourceType: 'RESTRICTION',
      resourceId: restriction.id,
      operationId: dto.operationId,
    });
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'RESTRICTION_CREATE',
      resourceType: 'RESTRICTION',
      resourceId: restriction.id,
    });
    return restriction;
  }

  async deactivateRestriction(auth: AuthContext, id: string) {
    const profile = await this.profileForOwner(auth.user.id);
    const result = await this.prisma.clinicalRestriction.updateMany({
      where: { id, clinicalProfileId: profile.id, active: true },
      data: { active: false },
    });
    if (result.count !== 1)
      throw new NotFoundException('Restricción no encontrada');
    return { id, active: false };
  }

  async createMedicationSchedule(
    auth: AuthContext,
    dto: CreateMedicationScheduleDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);
    if (dto.operationId) {
      const existing = await this.prisma.clinicalMedicationSchedule.findUnique({
        where: { operationId: dto.operationId },
      });
      if (existing) {
        if (existing.clinicalProfileId !== profile.id)
          throw new NotFoundException('Operación no disponible');
        return existing;
      }
    }
    const regimen = await this.prisma.clinicalMedicationRegimen.findFirst({
      where: { id: dto.regimenId, clinicalProfileId: profile.id },
    });
    if (!regimen)
      throw new BadRequestException(
        'El tratamiento no pertenece al expediente',
      );
    const activeForRegimen =
      await this.prisma.clinicalMedicationSchedule.findFirst({
        where: {
          regimenId: regimen.id,
          clinicalProfileId: profile.id,
          status: 'ACTIVE',
        },
      });
    if (activeForRegimen)
      throw new BadRequestException(
        'Este tratamiento ya tiene un horario activo',
      );

    const derived = deriveMedicationSchedule({
      firstDoseAt: dto.firstDoseAt,
      intervalHours: dto.intervalHours,
      endAt: dto.endAt,
      durationDays: regimen.durationDays,
    });

    const schedule = await this.prisma.clinicalMedicationSchedule.create({
      data: {
        clinicalProfileId: profile.id,
        regimenId: regimen.id,
        firstDoseAt: derived.firstDoseAt,
        intervalMinutes: derived.intervalMinutes,
        endAt: derived.endAt,
        nextDoseAt: derived.nextDoseAt,
        timezone: regimen.timezone,
        status: 'ACTIVE',
        createdById: auth.user.id,
        operationId: dto.operationId,
      },
    });

    await this.queueMedicationReminder(
      auth.user.id,
      schedule.id,
      schedule.nextDoseAt,
    );
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.medication.schedule_started',
      resourceType: 'MEDICATION_SCHEDULE',
      resourceId: schedule.id,
      operationId: dto.operationId,
      metadata: { intervalMinutes: schedule.intervalMinutes },
    });
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'MEDICATION_SCHEDULE_CREATE',
      resourceType: 'MEDICATION_SCHEDULE',
      resourceId: schedule.id,
    });
    return schedule;
  }

  private async queueMedicationReminder(
    userId: string,
    scheduleId: string,
    dueAt: Date | null,
  ) {
    if (!dueAt) return;
    const dedupeKey = `clinical:medication:${scheduleId}:${dueAt.toISOString()}`;
    await this.prisma.clinicalIntegrationEvent.upsert({
      where: { dedupeKey },
      update: { status: 'pending', deliveredAt: null, dueAt },
      create: {
        eventType: 'clinical.medication.reminder.requested',
        userId,
        sourceId: scheduleId,
        dueAt,
        title: 'Recordatorio de medicamento',
        sensitivity: 'PRIVATE',
        metadata: { scheduleId },
        status: 'pending',
        dedupeKey,
      },
    });
  }

  async recordMedicationDose(
    auth: AuthContext,
    scheduleId: string,
    dto: RecordMedicationDoseDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);
    const existing =
      await this.prisma.clinicalMedicationAdministration.findUnique({
        where: { operationId: dto.operationId },
      });
    if (existing) {
      if (
        existing.createdById !== auth.user.id ||
        existing.scheduleId !== scheduleId
      )
        throw new NotFoundException('Operación no disponible');
      return existing;
    }

    const schedule = await this.prisma.clinicalMedicationSchedule.findFirst({
      where: { id: scheduleId, clinicalProfileId: profile.id },
    });
    if (!schedule)
      throw new NotFoundException('Horario de medicamento no encontrado');
    if (schedule.status !== 'ACTIVE' || !schedule.nextDoseAt) {
      throw new BadRequestException(
        'Este tratamiento no tiene una dosis activa pendiente',
      );
    }

    const scheduledAt = schedule.nextDoseAt;
    const nextDoseAt = advanceMedicationSchedule({
      scheduledAt,
      intervalMinutes: schedule.intervalMinutes,
      endAt: schedule.endAt,
    });
    const nextStatus = nextDoseAt ? 'ACTIVE' : 'FINISHED';

    const administration = await this.prisma.$transaction(async (tx: any) => {
      const row = await tx.clinicalMedicationAdministration.create({
        data: {
          scheduleId: schedule.id,
          scheduledAt,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          status: dto.status,
          note: dto.note?.trim() || null,
          operationId: dto.operationId,
          createdById: auth.user.id,
        },
      });
      await tx.clinicalMedicationSchedule.update({
        where: { id: schedule.id },
        data: { nextDoseAt, status: nextStatus },
      });
      await tx.clinicalIntegrationEvent.updateMany({
        where: {
          sourceId: schedule.id,
          eventType: 'clinical.medication.reminder.requested',
          status: 'pending',
          dueAt: scheduledAt,
        },
        data: { status: 'cancelled' },
      });
      return row;
    });

    await this.queueMedicationReminder(auth.user.id, schedule.id, nextDoseAt);
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: `clinical.medication.${dto.status.toLowerCase()}`,
      resourceType: 'MEDICATION_SCHEDULE',
      resourceId: schedule.id,
      operationId: dto.operationId,
      metadata: {
        scheduledAt: scheduledAt.toISOString(),
        nextDoseAt: nextDoseAt?.toISOString() ?? null,
      },
    });
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'DOSE_RECORD',
      resourceType: 'MEDICATION_ADMINISTRATION',
      resourceId: administration.id,
    });
    return administration;
  }

  async changeMedicationSchedule(
    auth: AuthContext,
    scheduleId: string,
    dto: ChangeMedicationScheduleDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);
    const existingReceipt =
      await this.prisma.clinicalOperationReceipt.findUnique({
        where: { operationId: dto.operationId },
      });
    if (existingReceipt?.resourceId) {
      if (
        existingReceipt.actorUserId !== auth.user.id ||
        existingReceipt.clinicalProfileId !== profile.id ||
        existingReceipt.operationType !== 'MEDICATION_SCHEDULE_CHANGE' ||
        existingReceipt.resourceId !== scheduleId
      )
        throw new NotFoundException('Operación no disponible');
      return this.prisma.clinicalMedicationSchedule.findFirst({
        where: { id: scheduleId, clinicalProfileId: profile.id },
      });
    }
    const schedule = await this.prisma.clinicalMedicationSchedule.findFirst({
      where: { id: scheduleId, clinicalProfileId: profile.id },
    });
    if (!schedule) throw new NotFoundException('Horario no encontrado');

    const updated = await this.prisma.clinicalMedicationSchedule.update({
      where: { id: scheduleId },
      data: {
        status: dto.status,
        nextDoseAt:
          dto.status === 'ACTIVE'
            ? (schedule.nextDoseAt ?? new Date())
            : dto.status === 'SUSPENDED'
              ? null
              : null,
      },
    });
    await this.prisma.clinicalMedicationAdministration.create({
      data: {
        scheduleId,
        scheduledAt: schedule.nextDoseAt ?? new Date(),
        occurredAt: new Date(),
        status:
          dto.status === 'ACTIVE'
            ? 'RESUMED'
            : dto.status === 'FINISHED'
              ? 'FINISHED'
              : 'SUSPENDED',
        note: dto.note?.trim() || null,
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });
    if (dto.status === 'ACTIVE' && updated.nextDoseAt) {
      await this.queueMedicationReminder(
        auth.user.id,
        scheduleId,
        updated.nextDoseAt,
      );
    } else {
      await this.prisma.clinicalIntegrationEvent.updateMany({
        where: {
          sourceId: scheduleId,
          eventType: 'clinical.medication.reminder.requested',
          status: 'pending',
        },
        data: { status: 'cancelled' },
      });
    }
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'MEDICATION_SCHEDULE_CHANGE',
      resourceType: 'MEDICATION_SCHEDULE',
      resourceId: scheduleId,
    });
    return updated;
  }

  async createProcedure(auth: AuthContext, dto: CreateProcedureDto) {
    const profile = await this.profileForOwner(auth.user.id);
    if (dto.operationId) {
      const existing = await this.prisma.clinicalProcedure.findUnique({
        where: { operationId: dto.operationId },
      });
      if (existing) {
        if (existing.clinicalProfileId !== profile.id)
          throw new NotFoundException('Operación no disponible');
        return existing;
      }
    }
    await this.assertOwnedDocument(profile.id, dto.dischargeDocumentId);
    const procedure = await this.prisma.clinicalProcedure.create({
      data: {
        clinicalProfileId: profile.id,
        procedureName: dto.procedureName.trim(),
        occurredAt: new Date(dto.occurredAt),
        hospitalName: dto.hospitalName?.trim() || null,
        clinicianName: dto.clinicianName?.trim() || null,
        notes: dto.notes?.trim() || null,
        dischargeDocumentId: dto.dischargeDocumentId,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });
    await this.prisma.clinicalTimelineEvent.create({
      data: {
        profileId: profile.id,
        kind: 'OTHER',
        title: `Procedimiento: ${procedure.procedureName}`,
        status: 'COMPLETED',
        occurredAt: procedure.occurredAt,
        resourceType: 'PROCEDURE',
        resourceId: procedure.id,
        source: 'PATIENT_CONFIRMED',
        verificationStatus: 'UNVERIFIED',
        createdByUserId: auth.user.id,
      },
    });
    await this.recordReceipt({
      operationId: dto.operationId,
      profileId: profile.id,
      actorUserId: auth.user.id,
      operationType: 'PROCEDURE_CREATE',
      resourceType: 'PROCEDURE',
      resourceId: procedure.id,
    });
    return procedure;
  }

  async createFollowUpProposal(
    auth: AuthContext,
    dto: CreateFollowUpProposalDto,
  ) {
    const profile = await this.profileForOwner(auth.user.id);
    await this.assertOwnedDocument(profile.id, dto.sourceDocumentId);
    if (dto.consultationId) {
      const consultation = await this.prisma.clinicalConsultation.findFirst({
        where: { id: dto.consultationId, clinicalProfileId: profile.id },
      });
      if (!consultation)
        throw new BadRequestException('La consulta no pertenece al expediente');
    }
    const proposal = await this.prisma.clinicalFollowUpProposal.create({
      data: {
        clinicalProfileId: profile.id,
        consultationId: dto.consultationId,
        sourceDocumentId: dto.sourceDocumentId,
        recommendationText: dto.recommendationText.trim(),
        targetAt: new Date(dto.targetAt),
        status: 'PROPOSED',
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.follow_up.proposed',
      resourceType: 'FOLLOW_UP_PROPOSAL',
      resourceId: proposal.id,
      operationId: dto.operationId,
    });
    return proposal;
  }

  async decideFollowUp(auth: AuthContext, id: string, accept: boolean) {
    const profile = await this.profileForOwner(auth.user.id);
    const proposal = await this.prisma.clinicalFollowUpProposal.findFirst({
      where: { id, clinicalProfileId: profile.id, status: 'PROPOSED' },
    });
    if (!proposal)
      throw new NotFoundException('Propuesta de revisión no encontrada');
    if (!accept) {
      return this.prisma.clinicalFollowUpProposal.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
    }

    const sourceConsultation = proposal.consultationId
      ? await this.prisma.clinicalConsultation.findFirst({
          where: { id: proposal.consultationId, clinicalProfileId: profile.id },
          select: { subjectType: true, clinicianUserId: true },
        })
      : null;

    const consultation = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.clinicalConsultation.create({
        data: {
          clinicalProfileId: profile.id,
          patientUserId: auth.user.id,
          clinicianUserId: sourceConsultation?.clinicianUserId ?? null,
          subjectType: sourceConsultation?.subjectType ?? 'HUMAN',
          mode: 'follow_up',
          status: 'scheduled',
          scheduledAt: proposal.targetAt,
          timezone: 'America/Mexico_City',
          reason: proposal.recommendationText,
          priceCents: 0,
          currency: 'MXN',
          paymentStatus: 'waived',
        },
      });
      await tx.clinicalFollowUpProposal.update({
        where: { id },
        data: { status: 'ACCEPTED', acceptedConsultationId: created.id },
      });
      await tx.clinicalTimelineEvent.create({
        data: {
          profileId: profile.id,
          kind: 'FOLLOW_UP',
          title: 'Revisión aceptada',
          status: 'SCHEDULED',
          occurredAt: proposal.targetAt,
          resourceType: 'CONSULTATION',
          resourceId: created.id,
          source: 'PATIENT_CONFIRMED',
          verificationStatus: 'UNVERIFIED',
          createdByUserId: auth.user.id,
        },
      });
      return created;
    });

    await this.prisma.clinicalIntegrationEvent.upsert({
      where: { dedupeKey: `clinical:followup:${consultation.id}` },
      update: {},
      create: {
        eventType: 'clinical.consultation.scheduled',
        userId: auth.user.id,
        sourceId: consultation.id,
        dueAt: consultation.scheduledAt,
        title: 'Consulta de seguimiento',
        sensitivity: 'PRIVATE',
        metadata: { followUp: true },
        status: 'pending',
        dedupeKey: `clinical:followup:${consultation.id}`,
      },
    });
    return { proposalId: id, consultation };
  }

  async doctorSummary(auth: AuthContext, dto: DoctorSummaryDto) {
    const profile = await this.profileForOwner(auth.user.id);
    const daysBack = dto.daysBack ?? 90;
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60_000);
    const [
      allergies,
      restrictions,
      schedules,
      consultations,
      procedures,
      documents,
    ] = await Promise.all([
      this.prisma.clinicalAllergy.findMany({
        where: { clinicalProfileId: profile.id, active: true },
        take: 30,
      }),
      this.prisma.clinicalRestriction.findMany({
        where: { clinicalProfileId: profile.id, active: true },
        take: 30,
      }),
      this.prisma.clinicalMedicationSchedule.findMany({
        where: {
          clinicalProfileId: profile.id,
          status: { in: ['ACTIVE', 'SUSPENDED', 'FINISHED'] },
          updatedAt: { gte: since },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.clinicalTimelineEvent.findMany({
        where: {
          profileId: profile.id,
          kind: { in: ['APPOINTMENT', 'FOLLOW_UP'] },
          occurredAt: { gte: since },
        },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      }),
      this.prisma.clinicalProcedure.findMany({
        where: { clinicalProfileId: profile.id, occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      }),
      this.prisma.clinicalDocument.findMany({
        where: {
          profileId: profile.id,
          deletedAt: null,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const enriched = await this.enrichSchedules(schedules);
    const lines = buildSimpleDoctorSummaryLines({
      generatedAt: new Date(),
      allergies,
      restrictions,
      medications: enriched.map((item) => ({
        name: item.medication?.medicationName ?? 'Medicamento',
        instructions: item.regimen?.instructions ?? '',
        status: item.status,
        taken: item.taken,
        omitted: item.omitted,
      })),
      consultations,
      procedures,
      documents,
    });

    let savedDocument: any = null;
    if (dto.saveToFiles) {
      const pdf = this.buildTextPdf(lines);
      const documentId = randomUUID();
      const storageKey = await this.storage.saveOriginal(
        profile.id,
        documentId,
        pdf,
      );
      try {
        savedDocument = await this.prisma.$transaction(async (tx: any) => {
          const document = await tx.clinicalDocument.create({
            data: {
              id: documentId,
              profileId: profile.id,
              title: `Resumen para médico · ${new Date().toISOString().slice(0, 10)}`,
              documentType: 'SUMMARY',
              originalName: `yalika-resumen-medico-${new Date().toISOString().slice(0, 10)}.pdf`,
              mimeType: 'application/pdf',
              byteSize: pdf.length,
              sha256: sha256(pdf),
              storageKey,
              source: 'YALEKA_GENERATED',
              verificationStatus: 'UNVERIFIED',
              clinicalDate: new Date(),
              createdByUserId: auth.user.id,
            },
          });
          await tx.clinicalDocumentVersion.create({
            data: {
              documentId: document.id,
              versionNumber: 1,
              storageKey,
              sha256: sha256(pdf),
              mimeType: 'application/pdf',
              byteSize: pdf.length,
              kind: 'GENERATED',
              createdByUserId: auth.user.id,
            },
          });
          return document;
        });
      } catch (error) {
        await this.storage.remove(storageKey);
        throw error;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      daysBack,
      lines,
      savedDocument,
      disclaimer:
        'Basado sólo en hechos registrados en Yalika; no agrega diagnósticos nuevos.',
    };
  }

  private buildTextPdf(lines: string[]) {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '?');
    const escape = (value: string) =>
      normalize(value)
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)');
    const visible = lines.slice(0, 45);
    const content =
      visible
        .map(
          (line, index) =>
            `BT /F1 9 Tf 50 ${760 - index * 15} Td (${escape(line.slice(0, 105))}) Tj ET`,
        )
        .join('\n') + '\n';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    objects.forEach((object, index) => {
      offsets[index + 1] = Buffer.byteLength(pdf, 'utf8');
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i += 1)
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'utf8');
  }

  async createHealthQr(auth: AuthContext, dto: CreateHealthQrDto) {
    const profile = await this.profileForOwner(auth.user.id);
    let categories: string[];
    try {
      categories = normalizeHealthCategories(dto.categories);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Categorías inválidas',
      );
    }

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + dto.expiresInMinutes * 60_000);
    const link = await this.prisma.clinicalShareLink.create({
      data: {
        profileId: profile.id,
        tokenHash: sha256(token),
        tokenPrefix: tokenPrefix(token),
        resources: categories,
        permissions: ['VIEW'],
        purpose: 'HEALTH_QR',
        status: 'ACTIVE',
        maxUses: 50,
        usedCount: 0,
        expiresAt,
        createdByUserId: auth.user.id,
      },
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.health_qr.created',
      resourceType: 'SHARE_LINK',
      resourceId: link.id,
      metadata: { categories, expiresInMinutes: dto.expiresInMinutes },
    });
    return {
      link,
      token,
      relativePath: `/salud/qr?token=${encodeURIComponent(token)}`,
    };
  }

  async createCaregiverGrant(auth: AuthContext, dto: CreateCaregiverGrantDto) {
    const profile = await this.profileForOwner(auth.user.id);
    const caregiver = await this.prisma.user.findFirst({
      where: { email: dto.caregiverEmail.trim().toLowerCase() },
      select: { id: true, name: true, email: true },
    });
    if (!caregiver)
      throw new BadRequestException(
        'El familiar/cuidador debe tener una cuenta Yalika',
      );
    if (caregiver.id === auth.user.id)
      throw new BadRequestException('No necesitas darte acceso a ti mismo');

    let categories: string[];
    try {
      categories = normalizeHealthCategories(dto.categories);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Categorías inválidas',
      );
    }

    const expiresAt = new Date(
      Date.now() + dto.expiresInDays * 24 * 60 * 60_000,
    );
    const token = createOpaqueToken();
    const result = await this.prisma.$transaction(async (tx: any) => {
      const shareLink = await tx.clinicalShareLink.create({
        data: {
          profileId: profile.id,
          tokenHash: sha256(token),
          tokenPrefix: tokenPrefix(token),
          resources: categories,
          permissions: ['VIEW'],
          purpose: 'CAREGIVER',
          status: 'ACTIVE',
          maxUses: 100000,
          usedCount: 1,
          expiresAt,
          createdByUserId: auth.user.id,
        },
      });
      const request = await tx.clinicalAccessRequest.create({
        data: {
          shareLinkId: shareLink.id,
          requesterUserId: caregiver.id,
          status: 'APPROVED',
          decidedAt: new Date(),
          decidedByUserId: auth.user.id,
        },
      });
      const grant = await tx.clinicalAccessGrant.create({
        data: {
          profileId: profile.id,
          shareLinkId: shareLink.id,
          accessRequestId: request.id,
          granteeUserId: caregiver.id,
          resources: categories,
          permissions: ['VIEW'],
          purpose: 'CAREGIVER',
          status: 'ACTIVE',
          startsAt: new Date(),
          expiresAt,
          createdByUserId: auth.user.id,
        },
      });
      return { shareLink, request, grant };
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: auth.user.id,
      action: 'clinical.caregiver.granted',
      resourceType: 'ACCESS_GRANT',
      resourceId: result.grant.id,
      metadata: {
        caregiverUserId: caregiver.id,
        categories,
        expiresInDays: dto.expiresInDays,
      },
    });
    return { caregiver, grant: result.grant };
  }

  async grantForAccessRequest(auth: AuthContext, requestId: string) {
    const request = await this.prisma.clinicalAccessRequest.findFirst({
      where: { id: requestId, requesterUserId: auth.user.id },
      select: { id: true, status: true },
    });
    if (!request)
      throw new NotFoundException('Solicitud de acceso no encontrada');
    if (request.status !== 'APPROVED')
      return { status: request.status, grant: null };
    const grant = await this.prisma.clinicalAccessGrant.findFirst({
      where: {
        accessRequestId: request.id,
        granteeUserId: auth.user.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        purpose: true,
        permissions: true,
        startsAt: true,
        expiresAt: true,
        status: true,
      },
    });
    return { status: request.status, grant };
  }

  private async requireHealthSession(viewerUserId: string, sessionId: string) {
    const session = await this.prisma.clinicalAccessSession.findFirst({
      where: {
        id: sessionId,
        viewerUserId,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session)
      throw new ForbiddenException('Sesión clínica vencida o no autorizada');
    const grant = await this.prisma.clinicalAccessGrant.findFirst({
      where: {
        id: session.grantId,
        granteeUserId: viewerUserId,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!grant)
      throw new ForbiddenException('Acceso clínico revocado o vencido');
    const permissions = Array.isArray(grant.permissions)
      ? (grant.permissions as unknown[])
      : [];
    if (!permissions.includes('VIEW'))
      throw new ForbiddenException('Este permiso no permite consultar Salud');
    await this.prisma.clinicalAccessSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      session,
      grant,
      categories: normalizeHealthCategories(
        (grant.resources as unknown[]).map(String),
      ),
    };
  }

  async sharedHealthSummary(auth: AuthContext, sessionId: string) {
    const { grant, categories } = await this.requireHealthSession(
      auth.user.id,
      sessionId,
    );
    const full = categories.includes('FULL_HISTORY');
    const result: Record<string, unknown> = {
      categories,
      expiresAt: grant.expiresAt,
    };

    if (
      full ||
      categories.includes('ALLERGIES') ||
      categories.includes('ESSENTIAL')
    ) {
      result.allergies = await this.prisma.clinicalAllergy.findMany({
        where: { clinicalProfileId: grant.profileId, active: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }
    if (full || categories.includes('ESSENTIAL')) {
      result.restrictions = await this.prisma.clinicalRestriction.findMany({
        where: { clinicalProfileId: grant.profileId, active: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }
    if (
      full ||
      categories.includes('CURRENT_MEDICATIONS') ||
      categories.includes('ESSENTIAL')
    ) {
      const schedules = await this.prisma.clinicalMedicationSchedule.findMany({
        where: { clinicalProfileId: grant.profileId, status: 'ACTIVE' },
        orderBy: { nextDoseAt: 'asc' },
        take: 100,
      });
      result.currentMedications = await this.enrichSchedules(schedules);
    }
    if (full || categories.includes('PRESCRIPTIONS')) {
      result.prescriptions = await this.prisma.clinicalPrescription.findMany({
        where: { profileId: grant.profileId },
        include: { items: true },
        orderBy: { issuedAt: 'desc' },
        take: 50,
      });
    }
    if (full || categories.includes('STUDIES')) {
      result.studies = await this.prisma.clinicalDocument.findMany({
        where: {
          profileId: grant.profileId,
          deletedAt: null,
          documentType: 'STUDY',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          documentType: true,
          clinicalDate: true,
          verificationStatus: true,
          createdAt: true,
        },
      });
    }
    if (full || categories.includes('RECENT_CONSULTATIONS')) {
      result.consultations = await this.prisma.clinicalTimelineEvent.findMany({
        where: {
          profileId: grant.profileId,
          kind: { in: ['APPOINTMENT', 'FOLLOW_UP'] },
        },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      });
    }
    if (full || categories.includes('PROCEDURES')) {
      result.procedures = await this.prisma.clinicalProcedure.findMany({
        where: { clinicalProfileId: grant.profileId },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      });
    }

    await this.audit({
      profileId: grant.profileId,
      actorUserId: auth.user.id,
      action: 'clinical.health_shared.viewed',
      resourceType: 'ACCESS_GRANT',
      resourceId: grant.id,
      result: 'ALLOWED',
      grantId: grant.id,
      metadata: { categories },
    });
    return result;
  }

  async assistant(auth: AuthContext, query: string) {
    const [base, overview] = await Promise.all([
      this.r28.combinedAssistant(auth, query),
      this.overview(auth),
    ]);
    const normalized = query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const extra: string[] = [];
    const sources: any[] = Array.isArray((base as any).sources)
      ? [...(base as any).sources]
      : [];

    if (normalized.includes('alerg')) {
      const allergies = overview.important.allergies as any[];
      extra.push(
        allergies.length
          ? `Tienes ${allergies.length} alergia(s) activa(s) registradas.`
          : 'No hay alergias activas registradas.',
      );
      sources.push(
        ...allergies.map((a) => ({
          type: 'ALLERGY',
          id: a.id,
          title: a.substance,
          severity: a.severity,
        })),
      );
    }
    if (
      normalized.includes('medicina') ||
      normalized.includes('medicamento') ||
      normalized.includes('pastilla') ||
      normalized.includes('toca')
    ) {
      const next = overview.today.nextMedication as any;
      if (next?.nextDoseAt)
        extra.push(
          `La próxima dosis registrada corresponde a ${new Date(next.nextDoseAt).toLocaleString('es-MX')}.`,
        );
    }
    if (normalized.includes('qr'))
      extra.push(
        'Puedes abrir Mi QR Salud desde Cuidado diario y elegir exactamente qué categorías compartir.',
      );
    if (normalized.includes('consulta')) {
      const next = overview.today.nextConsultation as any;
      if (next?.scheduledAt)
        extra.push(
          `Tu próxima consulta registrada es ${new Date(next.scheduledAt).toLocaleString('es-MX')}.`,
        );
    }

    return {
      ...(base as any),
      message: `${extra.join(' ')} ${(base as any).message ?? ''}`.trim(),
      sources: sources.slice(0, 30),
    };
  }

  async sync(auth: AuthContext, dto: SyncBatchDto) {
    const results: any[] = [];
    for (const op of dto.operations) {
      const receipt = await this.prisma.clinicalOperationReceipt.findUnique({
        where: { operationId: op.operationId },
      });
      if (receipt) {
        if (
          receipt.actorUserId !== auth.user.id ||
          receipt.operationType !== op.kind
        ) {
          results.push({
            operationId: op.operationId,
            status: 'failed',
            error: 'Operación no disponible para esta cuenta',
          });
          continue;
        }
        results.push({
          operationId: op.operationId,
          status: 'already_applied',
          resourceId: receipt.resourceId,
        });
        continue;
      }
      try {
        let resource: any;
        switch (op.kind) {
          case 'CAPTURE_CREATE':
            resource = await this.createCapture(auth, {
              ...(op.payload as any),
              operationId: op.operationId,
            });
            break;
          case 'DOSE_RECORD': {
            const payload = op.payload as any;
            resource = await this.recordMedicationDose(
              auth,
              String(payload.scheduleId),
              {
                status: payload.status,
                occurredAt: payload.occurredAt,
                note: payload.note,
                operationId: op.operationId,
              },
            );
            break;
          }
          case 'ALLERGY_CREATE':
            resource = await this.createAllergy(auth, {
              ...(op.payload as any),
              operationId: op.operationId,
            });
            break;
          case 'RESTRICTION_CREATE':
            resource = await this.createRestriction(auth, {
              ...(op.payload as any),
              operationId: op.operationId,
            });
            break;
          case 'PROCEDURE_CREATE':
            resource = await this.createProcedure(auth, {
              ...(op.payload as any),
              operationId: op.operationId,
            });
            break;
          default:
            throw new BadRequestException(
              `Operación offline no soportada: ${op.kind}`,
            );
        }
        results.push({
          operationId: op.operationId,
          status: 'applied',
          resourceId: resource?.id ?? null,
        });
      } catch (error) {
        results.push({
          operationId: op.operationId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }
    return { results };
  }
}
