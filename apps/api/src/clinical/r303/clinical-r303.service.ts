import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalR29Service } from '../r29/clinical-r29.service';
import { buildHealthCompletion } from './clinical-r303.domain';
import type { CreateChronicConditionDto, UpdateEmergencyProfileDto } from './dto/r303.dto';

@Injectable()
export class ClinicalR303Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r29: ClinicalR29Service,
  ) {}

  private profile(ownerUserId: string) {
    return this.prisma.clinicalProfile.upsert({
      where: { ownerUserId },
      update: {},
      create: { ownerUserId },
    });
  }

  private audit(profileId: string, actorUserId: string, action: string, resourceType?: string, resourceId?: string) {
    return this.prisma.clinicalAuditEvent.create({
      data: {
        profileId,
        actorUserId,
        action,
        resourceType,
        resourceId,
        result: 'RECORDED',
      },
    });
  }

  async home(auth: AuthContext) {
    const [profile, care] = await Promise.all([
      this.profile(auth.user.id),
      this.r29.overview(auth),
    ]);
    const [essentials, chronicConditions] = await Promise.all([
      this.prisma.clinicalEmergencyProfile.findUnique({
        where: { clinicalProfileId: profile.id },
      }),
      this.prisma.clinicalChronicCondition.findMany({
        where: { clinicalProfileId: profile.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const completion = buildHealthCompletion({
      bloodType: Boolean(essentials?.bloodType && essentials.bloodType !== 'UNKNOWN'),
      emergencyContact: Boolean(essentials?.emergencyContactName && essentials?.emergencyContactPhone),
      allergies: Boolean(care.important.allergies?.length),
      chronicConditions: Boolean(chronicConditions.length),
      currentMedications: Boolean(care.important.currentMedications?.length),
      procedures: Boolean(care.recent.procedures?.length),
    });

    return {
      ...care,
      essentials,
      chronicConditions,
      completion,
      safety: {
        bloodTypeIsReferenceOnly: true,
        aiMayOrganizeButNotDiagnose: true,
      },
    };
  }

  async updateEssentials(auth: AuthContext, dto: UpdateEmergencyProfileDto) {
    const profile = await this.profile(auth.user.id);
    const saved = await this.prisma.clinicalEmergencyProfile.upsert({
      where: { clinicalProfileId: profile.id },
      update: {
        bloodType: dto.bloodType,
        bloodTypeSource: dto.bloodTypeSource,
        bloodTypeConfirmationStatus: dto.bloodTypeConfirmationStatus,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactRelationship: dto.emergencyContactRelationship,
        emergencyContactPhone: dto.emergencyContactPhone,
        emergencyNotes: dto.emergencyNotes,
        updatedById: auth.user.id,
      },
      create: {
        clinicalProfileId: profile.id,
        bloodType: dto.bloodType,
        bloodTypeSource: dto.bloodTypeSource ?? 'PATIENT',
        bloodTypeConfirmationStatus: dto.bloodTypeConfirmationStatus ?? 'REPORTED',
        emergencyContactName: dto.emergencyContactName,
        emergencyContactRelationship: dto.emergencyContactRelationship,
        emergencyContactPhone: dto.emergencyContactPhone,
        emergencyNotes: dto.emergencyNotes,
        updatedById: auth.user.id,
      },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.patient_essentials.updated', 'EMERGENCY_PROFILE', saved.id);
    return saved;
  }

  async createChronicCondition(auth: AuthContext, dto: CreateChronicConditionDto) {
    const profile = await this.profile(auth.user.id);
    const condition = await this.prisma.clinicalChronicCondition.create({
      data: {
        clinicalProfileId: profile.id,
        conditionName: dto.conditionName.trim(),
        diagnosedAt: dto.diagnosedAt ? new Date(dto.diagnosedAt) : undefined,
        source: dto.source ?? 'PATIENT',
        confirmationStatus: dto.confirmationStatus ?? 'REPORTED',
        notes: dto.notes,
        operationId: dto.operationId,
        createdById: auth.user.id,
      },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.chronic_condition.created', 'CHRONIC_CONDITION', condition.id);
    return condition;
  }

  async deactivateChronicCondition(auth: AuthContext, id: string) {
    const profile = await this.profile(auth.user.id);
    const existing = await this.prisma.clinicalChronicCondition.findFirst({
      where: { id, clinicalProfileId: profile.id, status: 'ACTIVE' },
    });
    if (!existing) throw new NotFoundException('El padecimiento no existe o ya no está activo');
    const updated = await this.prisma.clinicalChronicCondition.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.chronic_condition.deactivated', 'CHRONIC_CONDITION', id);
    return updated;
  }

  async assistant(auth: AuthContext, query: string) {
    const [base, profile] = await Promise.all([
      this.r29.assistant(auth, query),
      this.profile(auth.user.id),
    ]);
    const [essentials, chronic] = await Promise.all([
      this.prisma.clinicalEmergencyProfile.findUnique({ where: { clinicalProfileId: profile.id } }),
      this.prisma.clinicalChronicCondition.findMany({
        where: { clinicalProfileId: profile.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const extra: string[] = [];
    if (normalized.includes('sangre')) {
      extra.push(essentials?.bloodType && essentials.bloodType !== 'UNKNOWN'
        ? `Tu tipo de sangre registrado es ${essentials.bloodType}. Úsalo como referencia; un hospital debe verificar compatibilidad antes de una transfusión.`
        : 'Todavía no tienes tipo de sangre registrado.');
    }
    if (normalized.includes('padecimiento') || normalized.includes('cron') || normalized.includes('enfermedad')) {
      extra.push(chronic.length
        ? `Tienes ${chronic.length} padecimiento(s) crónico(s) activo(s) registrados.`
        : 'No tienes padecimientos crónicos activos registrados.');
    }
    if (normalized.includes('emergencia') || normalized.includes('contacto')) {
      extra.push(essentials?.emergencyContactName
        ? `Tu contacto de emergencia registrado es ${essentials.emergencyContactName}.`
        : 'Todavía no tienes contacto de emergencia registrado.');
    }
    return {
      ...base,
      message: `${extra.join(' ')} ${base.message ?? ''}`.trim(),
    };
  }
}
