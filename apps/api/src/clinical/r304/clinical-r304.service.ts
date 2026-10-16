import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { AuthContext } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEpisodeTitle, emergencyLinkExpiry } from './clinical-r304.domain';
import type { CreateEmergencyDelegateDto, CreateEmergencyRelayLinkDto, CreateHealthEpisodeDto, EmergencyTokenDto, LinkHealthResourceDto, ResolveHealthEpisodeDto, SetHealthPrivacyDto, UpdateEmergencySharePolicyDto } from './dto/r304.dto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const createToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class ClinicalR304Service {
  constructor(private readonly prisma: PrismaService) {}

  private profile(ownerUserId: string) {
    return this.prisma.clinicalProfile.upsert({ where: { ownerUserId }, update: {}, create: { ownerUserId } });
  }

  private audit(profileId: string, actorUserId: string, action: string, resourceType?: string, resourceId?: string, metadata?: any) {
    return this.prisma.clinicalAuditEvent.create({ data: { profileId, actorUserId, action, resourceType, resourceId, result: 'RECORDED', metadata } });
  }

  private async requireParent(profileId: string, type: string, id: string) {
    if (type === 'CHRONIC_CONDITION') return this.prisma.clinicalChronicCondition.findFirst({ where: { id, clinicalProfileId: profileId } });
    if (type === 'EPISODE') return this.prisma.clinicalHealthEpisode.findFirst({ where: { id, clinicalProfileId: profileId } });
    return null;
  }

  private async requireResource(profileId: string, type: string, id: string) {
    if (type === 'DOCUMENT') return this.prisma.clinicalDocument.findFirst({ where: { id, profileId, deletedAt: null } });
    if (type === 'PRESCRIPTION') return this.prisma.clinicalPrescription.findFirst({ where: { id, profileId } });
    if (type === 'PROCEDURE') return this.prisma.clinicalProcedure.findFirst({ where: { id, clinicalProfileId: profileId } });
    if (type === 'VISIT_CAPTURE') return this.prisma.clinicalVisitCapture.findFirst({ where: { id, clinicalProfileId: profileId } });
    if (type === 'CONSULTATION') return this.prisma.clinicalConsultation.findFirst({ where: { id, clinicalProfileId: profileId } });
    if (type === 'CHRONIC_CONDITION') return this.prisma.clinicalChronicCondition.findFirst({ where: { id, clinicalProfileId: profileId } });
    if (type === 'EPISODE') return this.prisma.clinicalHealthEpisode.findFirst({ where: { id, clinicalProfileId: profileId } });
    return null;
  }

  async history(auth: AuthContext) {
    const profile = await this.profile(auth.user.id);
    const [conditions, episodes, procedures, documents, prescriptions, links, privacy] = await Promise.all([
      this.prisma.clinicalChronicCondition.findMany({ where: { clinicalProfileId: profile.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.clinicalHealthEpisode.findMany({ where: { clinicalProfileId: profile.id }, orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }], take: 200 }),
      this.prisma.clinicalProcedure.findMany({ where: { clinicalProfileId: profile.id }, orderBy: { occurredAt: 'desc' }, take: 100 }),
      this.prisma.clinicalDocument.findMany({ where: { profileId: profile.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 150, select: { id: true, title: true, documentType: true, clinicalDate: true, verificationStatus: true, source: true, createdAt: true } }),
      this.prisma.clinicalPrescription.findMany({ where: { profileId: profile.id }, include: { items: true }, orderBy: { issuedAt: 'desc' }, take: 100 }),
      this.prisma.clinicalHealthRecordLink.findMany({ where: { clinicalProfileId: profile.id }, orderBy: { createdAt: 'desc' }, take: 500 }),
      this.prisma.clinicalHealthPrivacySetting.findMany({ where: { clinicalProfileId: profile.id }, take: 500 }),
    ]);
    return { profileId: profile.id, conditions, episodes, procedures, documents, prescriptions, links, privacy };
  }

  async createEpisode(auth: AuthContext, dto: CreateHealthEpisodeDto) {
    const profile = await this.profile(auth.user.id);
    if (dto.operationId) {
      const existing = await this.prisma.clinicalHealthEpisode.findUnique({ where: { operationId: dto.operationId } });
      if (existing) return existing;
    }
    const episode = await this.prisma.clinicalHealthEpisode.create({ data: {
      clinicalProfileId: profile.id, episodeType: dto.episodeType, title: buildEpisodeTitle(dto.episodeType, dto.title),
      bodyRegion: dto.bodyRegion?.trim() || null, startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : null, status: dto.endedAt ? 'RESOLVED' : 'ACTIVE',
      source: dto.source ?? 'PATIENT', confirmationStatus: dto.confirmationStatus ?? 'REPORTED', notes: dto.notes?.trim() || null,
      operationId: dto.operationId, createdById: auth.user.id,
    }});
    await this.audit(profile.id, auth.user.id, 'clinical.health_episode.created', 'EPISODE', episode.id, { episodeType: episode.episodeType });
    return episode;
  }

  async resolveEpisode(auth: AuthContext, id: string, dto: ResolveHealthEpisodeDto) {
    const profile = await this.profile(auth.user.id);
    const existing = await this.prisma.clinicalHealthEpisode.findFirst({ where: { id, clinicalProfileId: profile.id } });
    if (!existing) throw new NotFoundException('Episodio no encontrado');
    const updated = await this.prisma.clinicalHealthEpisode.update({ where: { id }, data: { status: 'RESOLVED', endedAt: dto.endedAt ? new Date(dto.endedAt) : new Date(), notes: dto.notes?.trim() || existing.notes } });
    await this.audit(profile.id, auth.user.id, 'clinical.health_episode.resolved', 'EPISODE', id);
    return updated;
  }

  async linkResource(auth: AuthContext, dto: LinkHealthResourceDto) {
    const profile = await this.profile(auth.user.id);
    if (!await this.requireParent(profile.id, dto.parentType, dto.parentId)) throw new BadRequestException('El padecimiento o episodio no pertenece a tu historial');
    if (!await this.requireResource(profile.id, dto.resourceType, dto.resourceId)) throw new BadRequestException('El recurso no pertenece a tu historial');
    const link = await this.prisma.clinicalHealthRecordLink.upsert({
      where: { clinicalProfileId_parentType_parentId_resourceType_resourceId: { clinicalProfileId: profile.id, parentType: dto.parentType, parentId: dto.parentId, resourceType: dto.resourceType, resourceId: dto.resourceId } },
      update: { relationType: dto.relationType ?? 'RELATED' },
      create: { clinicalProfileId: profile.id, parentType: dto.parentType, parentId: dto.parentId, resourceType: dto.resourceType, resourceId: dto.resourceId, relationType: dto.relationType ?? 'RELATED', operationId: dto.operationId, createdById: auth.user.id },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.health_record.linked', dto.parentType, dto.parentId, { resourceType: dto.resourceType, resourceId: dto.resourceId });
    return link;
  }

  async setPrivacy(auth: AuthContext, dto: SetHealthPrivacyDto) {
    const profile = await this.profile(auth.user.id);
    if (!await this.requireResource(profile.id, dto.resourceType, dto.resourceId)) throw new BadRequestException('Ese dato no pertenece a tu historial');
    const saved = await this.prisma.clinicalHealthPrivacySetting.upsert({
      where: { clinicalProfileId_resourceType_resourceId: { clinicalProfileId: profile.id, resourceType: dto.resourceType, resourceId: dto.resourceId } },
      update: { sensitivity: dto.sensitivity, shareWithVerifiedProfessional: dto.shareWithVerifiedProfessional, emergencyShare: dto.emergencyShare, updatedById: auth.user.id },
      create: { clinicalProfileId: profile.id, resourceType: dto.resourceType, resourceId: dto.resourceId, sensitivity: dto.sensitivity, shareWithVerifiedProfessional: dto.shareWithVerifiedProfessional, emergencyShare: dto.emergencyShare, updatedById: auth.user.id },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.health_privacy.updated', dto.resourceType, dto.resourceId, { sensitivity: dto.sensitivity, professional: dto.shareWithVerifiedProfessional, emergency: dto.emergencyShare });
    return saved;
  }

  async emergencySetup(auth: AuthContext) {
    const profile = await this.profile(auth.user.id);
    const [policy, delegates] = await Promise.all([
      this.prisma.clinicalEmergencySharePolicy.upsert({ where: { clinicalProfileId: profile.id }, update: {}, create: { clinicalProfileId: profile.id, updatedById: auth.user.id } }),
      this.prisma.clinicalEmergencyRelayAuthorization.findMany({ where: { clinicalProfileId: profile.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const ids = delegates.map((d: any) => d.delegateUserId);
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
    const byId = new Map(users.map((u: any) => [u.id, u]));
    return { profileId: profile.id, policy, delegates: delegates.map((d: any) => ({ ...d, user: byId.get(d.delegateUserId) ?? null })) };
  }

  async updateEmergencyPolicy(auth: AuthContext, dto: UpdateEmergencySharePolicyDto) {
    const profile = await this.profile(auth.user.id);
    const saved = await this.prisma.clinicalEmergencySharePolicy.upsert({
      where: { clinicalProfileId: profile.id },
      update: { ...dto, updatedById: auth.user.id },
      create: { clinicalProfileId: profile.id, ...dto, updatedById: auth.user.id },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.emergency_policy.updated', 'EMERGENCY_POLICY', saved.id);
    return saved;
  }

  async addDelegate(auth: AuthContext, dto: CreateEmergencyDelegateDto) {
    const profile = await this.profile(auth.user.id);
    const user = await this.prisma.user.findFirst({ where: { email: dto.email.trim().toLowerCase() }, select: { id: true, name: true, email: true } });
    if (!user) throw new BadRequestException('La persona de confianza debe tener una cuenta Yalika');
    if (user.id === auth.user.id) throw new BadRequestException('No puedes agregarte como tu propio contacto de confianza');
    const expiresAt = dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60_000) : null;
    const authorization = await this.prisma.clinicalEmergencyRelayAuthorization.upsert({
      where: { clinicalProfileId_delegateUserId: { clinicalProfileId: profile.id, delegateUserId: user.id } },
      update: { relationship: dto.relationship?.trim() || null, status: 'ACTIVE', canRelay: true, expiresAt, revokedAt: null },
      create: { clinicalProfileId: profile.id, delegateUserId: user.id, relationship: dto.relationship?.trim() || null, status: 'ACTIVE', canRelay: true, expiresAt, createdById: auth.user.id },
    });
    await this.audit(profile.id, auth.user.id, 'clinical.emergency_delegate.granted', 'EMERGENCY_DELEGATE', authorization.id, { delegateUserId: user.id });
    return { authorization, user };
  }

  async revokeDelegate(auth: AuthContext, id: string) {
    const profile = await this.profile(auth.user.id);
    const existing = await this.prisma.clinicalEmergencyRelayAuthorization.findFirst({ where: { id, clinicalProfileId: profile.id, status: 'ACTIVE' } });
    if (!existing) throw new NotFoundException('Contacto de confianza no encontrado');
    const updated = await this.prisma.clinicalEmergencyRelayAuthorization.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), canRelay: false } });
    await this.prisma.clinicalEmergencyRelayLink.updateMany({ where: { authorizationId: id, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    await this.audit(profile.id, auth.user.id, 'clinical.emergency_delegate.revoked', 'EMERGENCY_DELEGATE', id);
    return updated;
  }

  async delegateAuthorizations(auth: AuthContext) {
    const now = new Date();
    const auths = await this.prisma.clinicalEmergencyRelayAuthorization.findMany({ where: { delegateUserId: auth.user.id, status: 'ACTIVE', canRelay: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { createdAt: 'desc' } });
    const profileIds = auths.map((a: any) => a.clinicalProfileId);
    const profiles = profileIds.length ? await this.prisma.clinicalProfile.findMany({ where: { id: { in: profileIds } }, select: { id: true, ownerUserId: true } }) : [];
    const ownerIds = profiles.map((p: any) => p.ownerUserId);
    const owners = ownerIds.length ? await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [];
    const ownerById = new Map(owners.map((u: any) => [u.id, u]));
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));
    return auths.map((a: any) => { const p: any = profileById.get(a.clinicalProfileId); return { ...a, owner: p ? ownerById.get(p.ownerUserId) ?? null : null }; });
  }

  async createRelayLink(auth: AuthContext, dto: CreateEmergencyRelayLinkDto) {
    const now = new Date();
    const authorization = await this.prisma.clinicalEmergencyRelayAuthorization.findFirst({ where: { clinicalProfileId: dto.clinicalProfileId, delegateUserId: auth.user.id, status: 'ACTIVE', canRelay: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
    if (!authorization) throw new ForbiddenException('No tienes autorización activa para compartir la ficha de emergencia de esta persona');
    const token = createToken();
    const expiresAt = emergencyLinkExpiry(dto.minutes ?? 30);
    const link = await this.prisma.clinicalEmergencyRelayLink.create({ data: { clinicalProfileId: dto.clinicalProfileId, authorizationId: authorization.id, tokenHash: sha256(token), tokenPrefix: token.slice(0, 8), expiresAt, createdByUserId: auth.user.id } });
    await this.audit(dto.clinicalProfileId, auth.user.id, 'clinical.emergency_relay.link_created', 'EMERGENCY_RELAY_LINK', link.id, { expiresAt });
    return { link, token, relativePath: `/salud/emergencia/ver?token=${encodeURIComponent(token)}` };
  }

  private async assertVerifiedProfessional(userId: string) {
    const professional = await this.prisma.clinicalProfessionalProfile.findUnique({ where: { userId } });
    if (!professional || !professional.active || professional.verificationStatus !== 'VERIFIED') throw new ForbiddenException('Este acceso de emergencia requiere un profesional verificado en Yalika');
    const membership = await this.prisma.clinicalOrganizationProfessional.findFirst({ where: { professionalProfileId: professional.id, status: 'ACTIVE', organization: { active: true, verificationStatus: 'VERIFIED' }, OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }] } });
    if (!membership) throw new ForbiddenException('El profesional no tiene una vinculación activa con un establecimiento verificado');
    return professional;
  }

  private async medicationSummary(profileId: string) {
    const schedules = await this.prisma.clinicalMedicationSchedule.findMany({ where: { clinicalProfileId: profileId, status: 'ACTIVE' }, orderBy: { nextDoseAt: 'asc' }, take: 100 });
    const regimenIds = schedules.map((s: any) => s.regimenId);
    const regimens = regimenIds.length ? await this.prisma.clinicalMedicationRegimen.findMany({ where: { id: { in: regimenIds } } }) : [];
    const itemIds = regimens.map((r: any) => r.prescriptionItemId).filter(Boolean);
    const items = itemIds.length ? await this.prisma.clinicalPrescriptionItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, medicationName: true, strength: true, form: true } }) : [];
    const regById = new Map(regimens.map((r: any) => [r.id, r])); const itemById = new Map(items.map((i: any) => [i.id, i]));
    return schedules.map((s: any) => { const r: any = regById.get(s.regimenId); const i: any = r?.prescriptionItemId ? itemById.get(r.prescriptionItemId) : null; return { id: s.id, nextDoseAt: s.nextDoseAt, medicationName: i?.medicationName ?? 'Medicamento', strength: i?.strength ?? null, form: i?.form ?? null, instructions: r?.instructions ?? null }; });
  }

  private async emergencySummary(profileId: string) {
    const policy = await this.prisma.clinicalEmergencySharePolicy.findUnique({ where: { clinicalProfileId: profileId } });
    const p = policy ?? { includeBloodType: true, includeAllergies: true, includeCurrentMedications: true, includeEmergencyContact: true, includeSharedConditions: true, includeSharedProcedures: false };
    const [essentials, allergies, meds, privacy] = await Promise.all([
      this.prisma.clinicalEmergencyProfile.findUnique({ where: { clinicalProfileId: profileId } }),
      p.includeAllergies ? this.prisma.clinicalAllergy.findMany({ where: { clinicalProfileId: profileId, active: true }, orderBy: { createdAt: 'desc' }, take: 100 }) : Promise.resolve([]),
      p.includeCurrentMedications ? this.medicationSummary(profileId) : Promise.resolve([]),
      this.prisma.clinicalHealthPrivacySetting.findMany({ where: { clinicalProfileId: profileId, emergencyShare: true }, take: 500 }),
    ]);
    const conditionIds = p.includeSharedConditions ? privacy.filter((x: any) => x.resourceType === 'CHRONIC_CONDITION').map((x: any) => x.resourceId) : [];
    const episodeIds = p.includeSharedConditions ? privacy.filter((x: any) => x.resourceType === 'EPISODE').map((x: any) => x.resourceId) : [];
    const procedureIds = p.includeSharedProcedures ? privacy.filter((x: any) => x.resourceType === 'PROCEDURE').map((x: any) => x.resourceId) : [];
    const [conditions, episodes, procedures, profile] = await Promise.all([
      conditionIds.length ? this.prisma.clinicalChronicCondition.findMany({ where: { id: { in: conditionIds }, clinicalProfileId: profileId, status: 'ACTIVE' } }) : Promise.resolve([]),
      episodeIds.length ? this.prisma.clinicalHealthEpisode.findMany({ where: { id: { in: episodeIds }, clinicalProfileId: profileId, status: 'ACTIVE' } }) : Promise.resolve([]),
      procedureIds.length ? this.prisma.clinicalProcedure.findMany({ where: { id: { in: procedureIds }, clinicalProfileId: profileId } }) : Promise.resolve([]),
      this.prisma.clinicalProfile.findUnique({ where: { id: profileId }, select: { ownerUserId: true } }),
    ]);
    const owner = profile ? await this.prisma.user.findUnique({ where: { id: profile.ownerUserId }, select: { name: true } }) : null;
    return {
      patientName: owner?.name ?? null,
      bloodType: p.includeBloodType ? essentials?.bloodType ?? null : null,
      bloodTypeSource: p.includeBloodType ? essentials?.bloodTypeSource ?? null : null,
      emergencyContact: p.includeEmergencyContact ? { name: essentials?.emergencyContactName ?? null, relationship: essentials?.emergencyContactRelationship ?? null, phone: essentials?.emergencyContactPhone ?? null } : null,
      allergies, currentMedications: meds, conditions, episodes, procedures,
      note: 'Ficha limitada a datos que la persona autorizó previamente para emergencia. No sustituye valoración clínica.',
    };
  }

  async useEmergencyLink(auth: AuthContext, dto: EmergencyTokenDto) {
    await this.assertVerifiedProfessional(auth.user.id);
    const hash = sha256(dto.token);
    const now = new Date();
    const link = await this.prisma.clinicalEmergencyRelayLink.findUnique({ where: { tokenHash: hash } });
    if (!link || link.status !== 'ACTIVE' || link.expiresAt <= now || link.usedCount >= link.maxUses) throw new ForbiddenException('El enlace de emergencia no es válido o ya venció');
    const consumed = await this.prisma.clinicalEmergencyRelayLink.updateMany({ where: { id: link.id, status: 'ACTIVE', expiresAt: { gt: now }, usedCount: { lt: link.maxUses } }, data: { usedCount: { increment: 1 }, lastUsedAt: now } });
    if (consumed.count !== 1) throw new ForbiddenException('El enlace de emergencia ya no está disponible');
    const summary = await this.emergencySummary(link.clinicalProfileId);
    await this.audit(link.clinicalProfileId, auth.user.id, 'clinical.emergency_relay.viewed', 'EMERGENCY_RELAY_LINK', link.id, { viewerUserId: auth.user.id });
    return { expiresAt: link.expiresAt, ...summary };
  }

  async sharedStructuredHistory(auth: AuthContext, sessionId: string) {
    await this.assertVerifiedProfessional(auth.user.id);
    const session = await this.prisma.clinicalAccessSession.findFirst({ where: { id: sessionId, viewerUserId: auth.user.id, status: 'ACTIVE', revokedAt: null, expiresAt: { gt: new Date() } } });
    if (!session) throw new ForbiddenException('Sesión clínica vencida o no autorizada');
    const grant = await this.prisma.clinicalAccessGrant.findFirst({ where: { id: session.grantId, granteeUserId: auth.user.id, status: 'ACTIVE', revokedAt: null, expiresAt: { gt: new Date() } } });
    if (!grant) throw new ForbiddenException('Permiso clínico vencido o revocado');
    const categories = Array.isArray(grant.resources) ? grant.resources.map((x: any) => String(x)) : [];
    if (!categories.includes('FULL_HISTORY')) return { enabled: false, conditions: [], episodes: [], links: [] };
    const privacy = await this.prisma.clinicalHealthPrivacySetting.findMany({ where: { clinicalProfileId: grant.profileId, shareWithVerifiedProfessional: true }, take: 500 });
    const conditionIds = privacy.filter((x: any) => x.resourceType === 'CHRONIC_CONDITION').map((x: any) => x.resourceId);
    const episodeIds = privacy.filter((x: any) => x.resourceType === 'EPISODE').map((x: any) => x.resourceId);
    const [conditions, episodes, links] = await Promise.all([
      conditionIds.length ? this.prisma.clinicalChronicCondition.findMany({ where: { id: { in: conditionIds }, clinicalProfileId: grant.profileId } }) : Promise.resolve([]),
      episodeIds.length ? this.prisma.clinicalHealthEpisode.findMany({ where: { id: { in: episodeIds }, clinicalProfileId: grant.profileId } }) : Promise.resolve([]),
      this.prisma.clinicalHealthRecordLink.findMany({ where: { clinicalProfileId: grant.profileId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
    await this.audit(grant.profileId, auth.user.id, 'clinical.structured_history.viewed', 'ACCESS_GRANT', grant.id, { sessionId });
    return { enabled: true, conditions, episodes, links };
  }
}
