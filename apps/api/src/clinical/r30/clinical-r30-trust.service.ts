import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import {
  evaluateProfessionalPermission,
  normalizeCredential,
} from './clinical-r30.domain';
import {
  CreateCareOrganizationDto,
  EndProfessionalMembershipDto,
  InviteProfessionalDto,
  UpdateCareOrganizationDto,
  UpsertProfessionalProfileDto,
  VerifyOrganizationDto,
  VerifyProfessionalDto,
} from './dto/r30.dto';

@Injectable()
export class ClinicalR30TrustService {
  constructor(private readonly prisma: PrismaService) {}

  private requireReviewer(auth: any) {
    const user = auth?.user ?? {};
    const values = [
      user.role,
      user.globalRole,
      ...(Array.isArray(user.roles) ? user.roles : []),
    ]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase());

    if (!values.some((value) =>
      ['ADMIN', 'SUPERADMIN', 'PLATFORM_ADMIN'].includes(value),
    )) {
      throw new ForbiddenException(
        'Esta acción requiere revisión de plataforma Yalika.',
      );
    }
  }

  private async requireOwnedOrganization(userId: string, organizationId: string) {
    const organization = await this.prisma.clinicalCareOrganization.findFirst({
      where: { id: organizationId, ownerUserId: userId, active: true },
    });
    if (!organization) {
      throw new NotFoundException('Establecimiento no encontrado o no autorizado');
    }
    return organization;
  }

  private async selfProfessional(userId: string) {
    const professional =
      await this.prisma.clinicalProfessionalProfile.findUnique({
        where: { userId },
      });
    if (!professional) {
      throw new NotFoundException(
        'Primero crea tu perfil profesional en Yalika.',
      );
    }
    return professional;
  }

  private permissionForMembership(membership: any) {
    return evaluateProfessionalPermission({
      organizationVerificationStatus:
        membership.organization.verificationStatus,
      organizationActive: membership.organization.active,
      professionalVerificationStatus:
        membership.professional.verificationStatus,
      professionalActive: membership.professional.active,
      canPrescribe: membership.professional.canPrescribe,
      membershipStatus: membership.status,
      startsAt: membership.startsAt,
      endsAt: membership.endsAt,
    });
  }

  async me(auth: any) {
    const userId = auth.user.id;

    const [professional, organizations] = await Promise.all([
      this.prisma.clinicalProfessionalProfile.findUnique({
        where: { userId },
      }),
      this.prisma.clinicalCareOrganization.findMany({
        where: { ownerUserId: userId, active: true },
        orderBy: { createdAt: 'desc' },
        include: {
          memberships: {
            orderBy: { createdAt: 'desc' },
            include: { professional: true },
          },
        },
      }),
    ]);

    const memberships = professional
      ? await this.prisma.clinicalOrganizationProfessional.findMany({
          where: { professionalProfileId: professional.id },
          orderBy: { createdAt: 'desc' },
          include: { organization: true, professional: true },
        })
      : [];

    return {
      professional,
      organizations,
      memberships: memberships.map((membership) => ({
        ...membership,
        prescriptionGate: this.permissionForMembership(membership),
      })),
      policy: {
        onlinePrescriptionEnabled: false,
        onlineConsultationEnabled: false,
        automaticSepVerificationEnabled: false,
        physicalPrescriptionPhase: 'NEXT',
      },
    };
  }

  async upsertProfessionalProfile(
    auth: any,
    dto: UpsertProfessionalProfileDto,
  ) {
    const userId = auth.user.id;
    // YALEKA_R302_PROFILE_GATE: un profesional requiere establecimiento propio o invitaciÃ³n de uno.
    let profileGateEmail = String(auth?.user?.email ?? '').trim().toLowerCase();
    if (!profileGateEmail) {
      const account = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      profileGateEmail = String(account?.email ?? '').trim().toLowerCase();
    }
    const [ownedOrganizationForProfile, invitedForProfile] = await Promise.all([
      this.prisma.clinicalCareOrganization.findFirst({
        where: { ownerUserId: userId, active: true },
        select: { id: true },
      }),
      profileGateEmail
        ? this.prisma.clinicalProfessionalInvitation.findFirst({
            where: { invitedEmail: profileGateEmail, status: 'INVITED' },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!ownedOrganizationForProfile && !invitedForProfile) {
      throw new BadRequestException(
        'El perfil profesional debe nacer desde un establecimiento registrado o una invitaciÃ³n de su Red de Salud.',
      );
    }
    const license = normalizeCredential(dto.professionalLicenseNumber);
    const specialist = dto.specialistLicenseNumber
      ? normalizeCredential(dto.specialistLicenseNumber)
      : null;

    const duplicate =
      await this.prisma.clinicalProfessionalProfile.findFirst({
        where: {
          professionalLicenseNumber: license,
          NOT: { userId },
        },
      });
    if (duplicate) {
      throw new ConflictException(
        'Esta cédula profesional ya está asociada a otra cuenta Yalika.',
      );
    }

    const current =
      await this.prisma.clinicalProfessionalProfile.findUnique({
        where: { userId },
      });

    const trustChanged =
      !current ||
      current.professionalLicenseNumber !== license ||
      current.profession.trim() !== dto.profession.trim() ||
      (current.specialistLicenseNumber ?? null) !== specialist;

    return this.prisma.clinicalProfessionalProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: dto.displayName.trim(),
        professionalLicenseNumber: license,
        profession: dto.profession.trim(),
        specialty: dto.specialty?.trim() || null,
        specialistLicenseNumber: specialist,
        verificationStatus: 'PENDING',
        canPrescribe: false,
        active: true,
      },
      update: {
        displayName: dto.displayName.trim(),
        professionalLicenseNumber: license,
        profession: dto.profession.trim(),
        specialty: dto.specialty?.trim() || null,
        specialistLicenseNumber: specialist,
        ...(trustChanged
          ? {
              verificationStatus: 'PENDING',
              canPrescribe: false,
              verificationSource: null,
              verificationReference: null,
              verificationNotes: null,
              verifiedAt: null,
              verifiedById: null,
            }
          : {}),
      },
    });
  }

  async createOrganization(auth: any, dto: CreateCareOrganizationDto) {
    return this.prisma.clinicalCareOrganization.create({
      data: {
        ownerUserId: auth.user.id,
        organizationType: dto.organizationType,
        displayName: dto.displayName.trim(),
        legalName: dto.legalName?.trim() || null,
        rfc: dto.rfc?.trim().toUpperCase() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        addressLine1: dto.addressLine1?.trim() || null,
        addressLine2: dto.addressLine2?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        municipality: dto.municipality?.trim() || null,
        state: dto.state?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
        sanitaryNoticeNumber: dto.sanitaryNoticeNumber?.trim() || null,
        healthAuthorizationNumber:
          dto.healthAuthorizationNumber?.trim() || null,
        responsibleName: dto.responsibleName?.trim() || null,
        responsibleRole: dto.responsibleRole?.trim() || null,
        responsibleProfessionalLicense:
          dto.responsibleProfessionalLicense?.trim() || null,
        verificationStatus: 'PENDING',
        active: true,
      },
    });
  }

  async updateOrganization(
    auth: any,
    organizationId: string,
    dto: UpdateCareOrganizationDto,
  ) {
    await this.requireOwnedOrganization(auth.user.id, organizationId);

    return this.prisma.clinicalCareOrganization.update({
      where: { id: organizationId },
      data: {
        organizationType: dto.organizationType,
        displayName: dto.displayName.trim(),
        legalName: dto.legalName?.trim() || null,
        rfc: dto.rfc?.trim().toUpperCase() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        addressLine1: dto.addressLine1?.trim() || null,
        addressLine2: dto.addressLine2?.trim() || null,
        neighborhood: dto.neighborhood?.trim() || null,
        municipality: dto.municipality?.trim() || null,
        state: dto.state?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
        sanitaryNoticeNumber: dto.sanitaryNoticeNumber?.trim() || null,
        healthAuthorizationNumber:
          dto.healthAuthorizationNumber?.trim() || null,
        responsibleName: dto.responsibleName?.trim() || null,
        responsibleRole: dto.responsibleRole?.trim() || null,
        responsibleProfessionalLicense:
          dto.responsibleProfessionalLicense?.trim() || null,
        verificationStatus: 'PENDING',
        verificationSource: null,
        verificationNotes: null,
        verifiedAt: null,
        verifiedById: null,
      },
    });
  }

  async organizationTeam(auth: any, organizationId: string) {
    await this.requireOwnedOrganization(auth.user.id, organizationId);
    const memberships =
      await this.prisma.clinicalOrganizationProfessional.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        include: { organization: true, professional: true },
      });
    return memberships.map((membership) => ({
      ...membership,
      prescriptionGate: this.permissionForMembership(membership),
    }));
  }

  async inviteProfessional(
    auth: any,
    organizationId: string,
    dto: InviteProfessionalDto,
  ) {
    await this.requireOwnedOrganization(auth.user.id, organizationId);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La fecha final debe ser posterior a la fecha de inicio.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { email: dto.professionalEmail.trim().toLowerCase() },
    });
    if (!user) {
      throw new BadRequestException(
        'Ese correo todavía no tiene una cuenta Yalika.',
      );
    }

    const professional =
      await this.prisma.clinicalProfessionalProfile.findUnique({
        where: { userId: user.id },
      });
    if (!professional) {
      throw new BadRequestException(
        'La persona debe crear primero su perfil profesional y registrar su cédula.',
      );
    }

    const existing =
      await this.prisma.clinicalOrganizationProfessional.findUnique({
        where: {
          organizationId_professionalProfileId: {
            organizationId,
            professionalProfileId: professional.id,
          },
        },
      });

    if (existing && existing.status !== 'ENDED') {
      throw new ConflictException(
        'Este profesional ya tiene una relación vigente o pendiente con el establecimiento.',
      );
    }

    if (existing) {
      return this.prisma.clinicalOrganizationProfessional.update({
        where: { id: existing.id },
        data: {
          invitedById: auth.user.id,
          relationshipType: dto.relationshipType ?? 'AGREEMENT',
          status: 'INVITED',
          startsAt,
          endsAt,
          acceptedAt: null,
          endedAt: null,
          endReason: null,
        },
      });
    }

    return this.prisma.clinicalOrganizationProfessional.create({
      data: {
        organizationId,
        professionalProfileId: professional.id,
        invitedById: auth.user.id,
        relationshipType: dto.relationshipType ?? 'AGREEMENT',
        status: 'INVITED',
        startsAt,
        endsAt,
      },
    });
  }

  async acceptMembership(auth: any, membershipId: string) {
    const professional = await this.selfProfessional(auth.user.id);
    const membership =
      await this.prisma.clinicalOrganizationProfessional.findFirst({
        where: {
          id: membershipId,
          professionalProfileId: professional.id,
        },
        include: { organization: true, professional: true },
      });

    if (!membership) {
      throw new NotFoundException('Invitación profesional no encontrada');
    }
    if (membership.status !== 'INVITED') {
      throw new BadRequestException(
        'La invitación ya fue procesada o dejó de estar vigente.',
      );
    }

    const ready =
      membership.organization.verificationStatus === 'VERIFIED' &&
      professional.verificationStatus === 'VERIFIED';

    return this.prisma.clinicalOrganizationProfessional.update({
      where: { id: membership.id },
      data: {
        acceptedAt: new Date(),
        status: ready ? 'ACTIVE' : 'ACCEPTED_PENDING_VERIFICATION',
      },
      include: { organization: true, professional: true },
    });
  }

  async endMembership(
    auth: any,
    organizationId: string,
    membershipId: string,
    dto: EndProfessionalMembershipDto,
  ) {
    const membership =
      await this.prisma.clinicalOrganizationProfessional.findFirst({
        where: { id: membershipId, organizationId },
        include: { organization: true, professional: true },
      });
    if (!membership) throw new NotFoundException('Relación no encontrada');

    const isOwner = membership.organization.ownerUserId === auth.user.id;
    const isProfessional = membership.professional.userId === auth.user.id;
    if (!isOwner && !isProfessional) {
      throw new ForbiddenException('No puedes terminar esta relación');
    }

    return this.prisma.clinicalOrganizationProfessional.update({
      where: { id: membership.id },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        endReason: dto.reason?.trim() || null,
      },
    });
  }

  async adminPending(auth: any) {
    this.requireReviewer(auth);
    const [professionals, organizations] = await Promise.all([
      this.prisma.clinicalProfessionalProfile.findMany({
        where: { verificationStatus: { in: ['PENDING', 'UNDER_REVIEW'] } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.clinicalCareOrganization.findMany({
        where: { verificationStatus: { in: ['PENDING', 'UNDER_REVIEW'] } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { professionals, organizations };
  }

  async verifyProfessional(
    auth: any,
    professionalId: string,
    dto: VerifyProfessionalDto,
  ) {
    this.requireReviewer(auth);
    const professional =
      await this.prisma.clinicalProfessionalProfile.findUnique({
        where: { id: professionalId },
      });
    if (!professional) throw new NotFoundException('Profesional no encontrado');

    const canPrescribe =
      dto.result === 'VERIFIED' && dto.canPrescribe === true;

    await this.prisma.clinicalCredentialVerification.create({
      data: {
        professionalProfileId: professional.id,
        verificationType: dto.verificationType,
        credentialValue: professional.professionalLicenseNumber,
        source: dto.source,
        sourceReference: dto.sourceReference?.trim() || null,
        result: dto.result,
        notes: dto.notes?.trim() || null,
        checkedById: auth.user.id,
      },
    });

    const updated =
      await this.prisma.clinicalProfessionalProfile.update({
        where: { id: professional.id },
        data: {
          verificationStatus: dto.result,
          canPrescribe,
          verificationSource: dto.source,
          verificationReference: dto.sourceReference?.trim() || null,
          verificationNotes: dto.notes?.trim() || null,
          verifiedAt: dto.result === 'VERIFIED' ? new Date() : null,
          verifiedById: auth.user.id,
        },
      });

    if (dto.result === 'VERIFIED') {
      const pending =
        await this.prisma.clinicalOrganizationProfessional.findMany({
          where: {
            professionalProfileId: professional.id,
            status: 'ACCEPTED_PENDING_VERIFICATION',
          },
          include: { organization: true },
        });
      for (const membership of pending) {
        if (membership.organization.verificationStatus === 'VERIFIED') {
          await this.prisma.clinicalOrganizationProfessional.update({
            where: { id: membership.id },
            data: { status: 'ACTIVE' },
          });
        }
      }
    } else {
      await this.prisma.clinicalOrganizationProfessional.updateMany({
        where: {
          professionalProfileId: professional.id,
          status: 'ACTIVE',
        },
        data: { status: 'SUSPENDED' },
      });
    }

    return updated;
  }

  async verifyOrganization(
    auth: any,
    organizationId: string,
    dto: VerifyOrganizationDto,
  ) {
    this.requireReviewer(auth);
    const organization =
      await this.prisma.clinicalCareOrganization.findUnique({
        where: { id: organizationId },
      });
    if (!organization) throw new NotFoundException('Establecimiento no encontrado');

    await this.prisma.clinicalOrganizationVerification.create({
      data: {
        organizationId,
        verificationType: dto.verificationType,
        source: dto.source,
        sourceReference: dto.sourceReference?.trim() || null,
        result: dto.result,
        notes: dto.notes?.trim() || null,
        checkedById: auth.user.id,
      },
    });

    const updated = await this.prisma.clinicalCareOrganization.update({
      where: { id: organizationId },
      data: {
        verificationStatus: dto.result,
        verificationSource: dto.source,
        verificationNotes: dto.notes?.trim() || null,
        verifiedAt: dto.result === 'VERIFIED' ? new Date() : null,
        verifiedById: auth.user.id,
      },
    });

    if (dto.result === 'VERIFIED') {
      const pending =
        await this.prisma.clinicalOrganizationProfessional.findMany({
          where: {
            organizationId,
            status: 'ACCEPTED_PENDING_VERIFICATION',
          },
          include: { professional: true },
        });
      for (const membership of pending) {
        if (membership.professional.verificationStatus === 'VERIFIED') {
          await this.prisma.clinicalOrganizationProfessional.update({
            where: { id: membership.id },
            data: { status: 'ACTIVE' },
          });
        }
      }
    } else {
      await this.prisma.clinicalOrganizationProfessional.updateMany({
        where: { organizationId, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });
    }

    return updated;
  }
}
