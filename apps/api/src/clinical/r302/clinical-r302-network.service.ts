import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalStorageService } from '../clinical-storage.service';
import {
  evaluateRegistrationReadiness,
  EVIDENCE_KINDS,
  organizationTypeLabel,
  registrationRequirements,
} from './clinical-r302.domain';
import {
  CaptureOrganizationLocationDto,
  CreateNetworkOrganizationDto,
  InviteNetworkProfessionalDto,
} from './dto/r302.dto';

@Injectable()
export class ClinicalR302NetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
  ) {}

  private async requireOwnedOrganization(userId: string, organizationId: string) {
    const organization = await this.prisma.clinicalCareOrganization.findFirst({
      where: { id: organizationId, ownerUserId: userId, active: true },
    });
    if (!organization) {
      throw new NotFoundException('Establecimiento no encontrado o no autorizado');
    }
    return organization;
  }

  private async userEmail(auth: any) {
    const direct = String(auth?.user?.email ?? '').trim().toLowerCase();
    if (direct) return direct;
    const user = await this.prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { email: true },
    });
    return String(user?.email ?? '').trim().toLowerCase();
  }

  private async organizationBundle(organization: any) {
    const [location, evidence, invitations, memberships] = await Promise.all([
      this.prisma.clinicalOrganizationLocation.findUnique({
        where: { organizationId: organization.id },
      }),
      this.prisma.clinicalOrganizationEvidence.findMany({
        where: { organizationId: organization.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clinicalProfessionalInvitation.findMany({
        where: { organizationId: organization.id, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clinicalOrganizationProfessional.findMany({
        where: { organizationId: organization.id, status: { not: 'ENDED' } },
        orderBy: { createdAt: 'desc' },
        include: { professional: true },
      }),
    ]);
    const readiness = evaluateRegistrationReadiness({
      organization,
      location,
      evidenceKinds: evidence.map((item) => item.kind),
    });
    return {
      ...organization,
      typeLabel: organizationTypeLabel(organization.organizationType),
      requirements: registrationRequirements(organization.organizationType),
      readiness,
      location,
      evidence,
      invitations,
      memberships,
    };
  }

  async me(auth: any) {
    const email = await this.userEmail(auth);
    const [organizations, professional, pendingInvitations] = await Promise.all([
      this.prisma.clinicalCareOrganization.findMany({
        where: { ownerUserId: auth.user.id, active: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clinicalProfessionalProfile.findUnique({
        where: { userId: auth.user.id },
      }),
      email
        ? this.prisma.clinicalProfessionalInvitation.findMany({
            where: { invitedEmail: email, status: 'INVITED' },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const bundles: any[] = [];
    for (const organization of organizations) {
      bundles.push(await this.organizationBundle(organization));
    }

    const invitations: any[] = [];
    for (const invitation of pendingInvitations) {
      const organization = await this.prisma.clinicalCareOrganization.findUnique({
        where: { id: invitation.organizationId },
      });
      invitations.push({ ...invitation, organization });
    }

    return {
      organizations: bundles,
      professional,
      pendingInvitations: invitations,
      policy: {
        professionalRequiresOrganization: true,
        onlinePrescriptionEnabled: false,
        onlineConsultationEnabled: false,
        automaticGovernmentVerificationEnabled: false,
      },
    };
  }

  async createOrganization(auth: any, dto: CreateNetworkOrganizationDto) {
    return this.prisma.clinicalCareOrganization.create({
      data: {
        ownerUserId: auth.user.id,
        organizationType: dto.organizationType,
        displayName: dto.displayName.trim(),
        legalName: dto.legalName?.trim() || null,
        rfc: dto.rfc?.trim().toUpperCase() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        addressLine1: dto.addressLine1.trim(),
        addressLine2: dto.addressLine2?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        municipality: dto.municipality.trim(),
        state: dto.state.trim(),
        postalCode: dto.postalCode?.trim() || null,
        sanitaryNoticeNumber: dto.sanitaryNoticeNumber?.trim() || null,
        healthAuthorizationNumber: dto.healthAuthorizationNumber?.trim() || null,
        responsibleName: dto.responsibleName.trim(),
        responsibleRole: dto.responsibleRole?.trim() || null,
        responsibleProfessionalLicense:
          dto.responsibleProfessionalLicense?.trim() || null,
        verificationStatus: 'PENDING',
        active: true,
      },
    });
  }

  async saveLocation(
    auth: any,
    organizationId: string,
    dto: CaptureOrganizationLocationDto,
  ) {
    await this.requireOwnedOrganization(auth.user.id, organizationId);
    return this.prisma.clinicalOrganizationLocation.upsert({
      where: { organizationId },
      create: {
        organizationId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters ?? null,
        source: dto.source ?? 'DEVICE',
        capturedById: auth.user.id,
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters ?? null,
        source: dto.source ?? 'DEVICE',
        capturedById: auth.user.id,
        capturedAt: new Date(),
      },
    });
  }

  async uploadEvidence(
    auth: any,
    organizationId: string,
    kind: string,
    note: string | undefined,
    file:
      | {
          buffer: Buffer;
          originalname: string;
          mimetype: string;
          size: number;
        }
      | undefined,
  ) {
    await this.requireOwnedOrganization(auth.user.id, organizationId);
    if (!EVIDENCE_KINDS.includes(kind as any)) {
      throw new BadRequestException('Tipo de evidencia no permitido');
    }
    if (!file?.buffer?.length) throw new BadRequestException('Selecciona un archivo');
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Sólo se aceptan imágenes o PDF');
    }

    const id = randomUUID();
    const storageKey = await this.storage.saveOriginal(
      `organization-${organizationId}`,
      id,
      file.buffer,
    );

    try {
      return await this.prisma.clinicalOrganizationEvidence.create({
        data: {
          id,
          organizationId,
          kind,
          storageKey,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          note: note?.trim() || null,
          createdById: auth.user.id,
        },
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => null);
      throw error;
    }
  }

  async removeEvidence(auth: any, organizationId: string, evidenceId: string) {
    await this.requireOwnedOrganization(auth.user.id, organizationId);
    const evidence = await this.prisma.clinicalOrganizationEvidence.findFirst({
      where: { id: evidenceId, organizationId, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException('Documento no encontrado');
    await this.prisma.clinicalOrganizationEvidence.update({
      where: { id: evidence.id },
      data: { deletedAt: new Date(), status: 'REMOVED' },
    });
    await this.storage.remove(evidence.storageKey).catch(() => null);
    return { ok: true };
  }

  async submitForReview(auth: any, organizationId: string) {
    const organization = await this.requireOwnedOrganization(auth.user.id, organizationId);
    const [location, evidence] = await Promise.all([
      this.prisma.clinicalOrganizationLocation.findUnique({ where: { organizationId } }),
      this.prisma.clinicalOrganizationEvidence.findMany({
        where: { organizationId, deletedAt: null },
      }),
    ]);
    const readiness = evaluateRegistrationReadiness({
      organization,
      location,
      evidenceKinds: evidence.map((item) => item.kind),
    });
    if (!readiness.ready) {
      throw new BadRequestException(
        `Faltan datos para enviar a revisión: ${readiness.missing.join(', ')}`,
      );
    }

    await this.prisma.clinicalOrganizationReviewSubmission.create({
      data: {
        organizationId,
        submittedById: auth.user.id,
        snapshot: {
          organizationType: organization.organizationType,
          displayName: organization.displayName,
          addressLine1: organization.addressLine1,
          municipality: organization.municipality,
          state: organization.state,
          sanitaryNoticeNumber: organization.sanitaryNoticeNumber,
          healthAuthorizationNumber: organization.healthAuthorizationNumber,
          responsibleName: organization.responsibleName,
          location,
          evidenceKinds: evidence.map((item) => item.kind),
        } as any,
      },
    });

    return this.prisma.clinicalCareOrganization.update({
      where: { id: organizationId },
      data: {
        verificationStatus: 'UNDER_REVIEW',
        verificationSource: null,
        verificationNotes: null,
        verifiedAt: null,
        verifiedById: null,
      },
    });
  }

  async inviteProfessional(
    auth: any,
    organizationId: string,
    dto: InviteNetworkProfessionalDto,
  ) {
    const organization = await this.requireOwnedOrganization(auth.user.id, organizationId);
    if (['REJECTED', 'SUSPENDED'].includes(organization.verificationStatus)) {
      throw new ForbiddenException('Corrige primero el estado del establecimiento');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException('La vigencia final debe ser posterior al inicio');
    }
    const email = dto.professionalEmail.trim().toLowerCase();
    const existing = await this.prisma.clinicalProfessionalInvitation.findFirst({
      where: { organizationId, invitedEmail: email, status: 'INVITED' },
    });
    if (existing) throw new ConflictException('Ya existe una invitación pendiente para ese correo');

    const user = await this.prisma.user.findFirst({ where: { email }, select: { id: true } });
    return this.prisma.clinicalProfessionalInvitation.create({
      data: {
        organizationId,
        invitedEmail: email,
        invitedUserId: user?.id ?? null,
        relationshipType: dto.relationshipType ?? 'AGREEMENT',
        startsAt,
        endsAt,
        createdById: auth.user.id,
      },
    });
  }

  async acceptInvitation(auth: any, invitationId: string) {
    const email = await this.userEmail(auth);
    const invitation = await this.prisma.clinicalProfessionalInvitation.findFirst({
      where: { id: invitationId, invitedEmail: email, status: 'INVITED' },
    });
    if (!invitation) throw new NotFoundException('Invitación no encontrada o no autorizada');

    const professional = await this.prisma.clinicalProfessionalProfile.findUnique({
      where: { userId: auth.user.id },
    });
    if (!professional) {
      throw new BadRequestException('Completa primero tu cédula y perfil profesional');
    }
    const organization = await this.prisma.clinicalCareOrganization.findUnique({
      where: { id: invitation.organizationId },
    });
    if (!organization?.active) throw new BadRequestException('El establecimiento ya no está activo');

    const ready =
      organization.verificationStatus === 'VERIFIED' &&
      professional.verificationStatus === 'VERIFIED';

    const existing = await this.prisma.clinicalOrganizationProfessional.findUnique({
      where: {
        organizationId_professionalProfileId: {
          organizationId: organization.id,
          professionalProfileId: professional.id,
        },
      },
    });

    const membership = existing
      ? await this.prisma.clinicalOrganizationProfessional.update({
          where: { id: existing.id },
          data: {
            invitedById: invitation.createdById,
            relationshipType: invitation.relationshipType,
            startsAt: invitation.startsAt,
            endsAt: invitation.endsAt,
            acceptedAt: new Date(),
            endedAt: null,
            endReason: null,
            status: ready ? 'ACTIVE' : 'ACCEPTED_PENDING_VERIFICATION',
          },
        })
      : await this.prisma.clinicalOrganizationProfessional.create({
          data: {
            organizationId: organization.id,
            professionalProfileId: professional.id,
            invitedById: invitation.createdById,
            relationshipType: invitation.relationshipType,
            startsAt: invitation.startsAt,
            endsAt: invitation.endsAt,
            acceptedAt: new Date(),
            status: ready ? 'ACTIVE' : 'ACCEPTED_PENDING_VERIFICATION',
          },
        });

    await this.prisma.clinicalProfessionalInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        invitedUserId: auth.user.id,
        membershipId: membership.id,
      },
    });
    return membership;
  }
}
