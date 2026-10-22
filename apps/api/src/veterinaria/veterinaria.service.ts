import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateVetConsultationDto,
  CreateVetPetDto,
  IssueVetPrescriptionDto,
  UpdateVetPetDto,
} from './dto/veterinaria.dto';
import { VET_PRESCRIBABLE_STATUSES } from './veterinaria.constants';
import {
  evaluateVeterinaryPrescriber,
  isGuardianActive,
} from './veterinaria.domain';

type VetPrescriptionWithItems = Prisma.VetPrescriptionGetPayload<{
  include: { items: true };
}>;
export type IssuedVetPrescription = VetPrescriptionWithItems & {
  idempotentReplay?: boolean;
};

function parseDate(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} inválida`);
  }
  return date;
}

@Injectable()
export class VeterinariaService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(
    client: Pick<Prisma.TransactionClient, 'vetAuditEvent'>,
    input: {
      petId?: string | null;
      actorUserId: string;
      action: string;
      result?: string;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await client.vetAuditEvent.create({
      data: {
        petId: input.petId ?? null,
        actorUserId: input.actorUserId,
        action: input.action,
        result: input.result ?? 'RECORDED',
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: (input.metadata as Prisma.InputJsonObject | undefined) ?? undefined,
      },
    });
  }

  // La identidad sale de la sesión; el petId del cliente nunca basta por sí solo.
  // Si no hay vínculo vigente se responde "no encontrada" para no revelar que existe.
  private async requireGuardian(userId: string, petId: string) {
    const guardian = await this.prisma.vetPetGuardian.findFirst({
      where: { petId, userId, status: 'ACTIVE', pet: { active: true } },
      include: { pet: true },
    });
    if (!guardian || !isGuardianActive(guardian)) {
      throw new NotFoundException('Mascota no encontrada');
    }
    return guardian;
  }

  async createPet(auth: AuthContext, dto: CreateVetPetDto) {
    const birthDate = dto.birthDate
      ? parseDate(dto.birthDate, 'Fecha de nacimiento')
      : null;
    if (birthDate && birthDate.getTime() > Date.now()) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede ser futura',
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const pet = await tx.vetPet.create({
        data: {
          name: dto.name.trim(),
          species: dto.species,
          breed: dto.breed?.trim() || null,
          sex: dto.sex ?? null,
          birthDate,
          birthDateApprox: dto.birthDateApprox ?? false,
          microchip: dto.microchip?.trim().toUpperCase() || null,
          createdByUserId: auth.user.id,
          guardians: {
            create: { userId: auth.user.id, role: 'OWNER', status: 'ACTIVE' },
          },
        },
      });
      await this.audit(tx, {
        petId: pet.id,
        actorUserId: auth.user.id,
        action: 'vet.pet.created',
        resourceType: 'PET',
        resourceId: pet.id,
        metadata: { species: pet.species },
      });
      return pet;
    });
  }

  async listPets(auth: AuthContext) {
    const rows = await this.prisma.vetPetGuardian.findMany({
      where: { userId: auth.user.id, status: 'ACTIVE', pet: { active: true } },
      include: { pet: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .filter((row) => isGuardianActive(row))
      .map((row) => ({ ...row.pet, guardianRole: row.role }));
  }

  async getPet(auth: AuthContext, petId: string) {
    const guardian = await this.requireGuardian(auth.user.id, petId);
    return { ...guardian.pet, guardianRole: guardian.role };
  }

  async updatePet(auth: AuthContext, petId: string, dto: UpdateVetPetDto) {
    const guardian = await this.requireGuardian(auth.user.id, petId);
    if (guardian.role !== 'OWNER') {
      throw new ForbiddenException(
        'Solo el tutor principal puede editar los datos de la mascota',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.species !== undefined) data.species = dto.species;
    if (dto.breed !== undefined) data.breed = dto.breed.trim() || null;
    if (dto.sex !== undefined) data.sex = dto.sex;
    if (dto.birthDateApprox !== undefined) {
      data.birthDateApprox = dto.birthDateApprox;
    }
    if (dto.microchip !== undefined) {
      data.microchip = dto.microchip.trim().toUpperCase() || null;
    }
    if (dto.birthDate !== undefined) {
      const birthDate = parseDate(dto.birthDate, 'Fecha de nacimiento');
      if (birthDate.getTime() > Date.now()) {
        throw new BadRequestException(
          'La fecha de nacimiento no puede ser futura',
        );
      }
      data.birthDate = birthDate;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('No hay cambios que guardar');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const pet = await tx.vetPet.update({ where: { id: petId }, data });
      await this.audit(tx, {
        petId,
        actorUserId: auth.user.id,
        action: 'vet.pet.updated',
        resourceType: 'PET',
        resourceId: petId,
        metadata: { fields: Object.keys(data) },
      });
      return pet;
    });
  }

  async createConsultation(
    auth: AuthContext,
    petId: string,
    dto: CreateVetConsultationDto,
  ) {
    await this.requireGuardian(auth.user.id, petId);
    const scheduledAt = parseDate(dto.scheduledAt, 'Fecha de consulta');

    let veterinarianUserId: string | null = null;
    if (dto.veterinarianEmail?.trim()) {
      const vet = await this.prisma.user.findFirst({
        where: { email: dto.veterinarianEmail.trim().toLowerCase() },
        select: { id: true },
      });
      if (!vet) {
        throw new BadRequestException(
          'No encontré una cuenta Yalika con ese correo profesional',
        );
      }
      if (vet.id === auth.user.id) {
        throw new BadRequestException(
          'No puedes asignarte a ti mismo como veterinario de tu consulta',
        );
      }
      veterinarianUserId = vet.id;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const consultation = await tx.vetConsultation.create({
        data: {
          petId,
          requestedByUserId: auth.user.id,
          veterinarianUserId,
          mode: dto.mode,
          status: 'scheduled',
          scheduledAt,
          reason: dto.reason?.trim() || null,
        },
      });
      await this.audit(tx, {
        petId,
        actorUserId: auth.user.id,
        action: 'vet.consultation.created',
        resourceType: 'CONSULTATION',
        resourceId: consultation.id,
        metadata: { mode: dto.mode, vetAssigned: Boolean(veterinarianUserId) },
      });
      return consultation;
    });
  }

  async listPetConsultations(auth: AuthContext, petId: string) {
    await this.requireGuardian(auth.user.id, petId);
    return this.prisma.vetConsultation.findMany({
      where: { petId },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
  }

  async listAssignedConsultations(auth: AuthContext) {
    return this.prisma.vetConsultation.findMany({
      where: { veterinarianUserId: auth.user.id, pet: { active: true } },
      include: {
        pet: {
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            sex: true,
            birthDate: true,
          },
        },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
  }

  async issuePrescription(
    auth: AuthContext,
    consultationId: string,
    dto: IssueVetPrescriptionDto,
  ): Promise<IssuedVetPrescription> {
    if (!dto.items?.length) {
      throw new BadRequestException('Agrega al menos un medicamento');
    }
    const issuedAt = parseDate(dto.issuedAt, 'Fecha de receta');

    const consultation = await this.prisma.vetConsultation.findFirst({
      where: {
        id: consultationId,
        veterinarianUserId: auth.user.id,
        status: { in: [...VET_PRESCRIBABLE_STATUSES] },
        pet: { active: true },
      },
    });
    if (!consultation) {
      throw new ForbiddenException(
        'Esta consulta no está asignada a tu cuenta como veterinario',
      );
    }

    const professional = await this.prisma.clinicalProfessionalProfile.findUnique({
      where: { userId: auth.user.id },
      include: { memberships: { include: { organization: true } } },
    });

    const decision = professional
      ? evaluateVeterinaryPrescriber({
          profession: professional.profession,
          professionalVerificationStatus: professional.verificationStatus,
          professionalActive: professional.active,
          canPrescribe: professional.canPrescribe,
          memberships: professional.memberships ?? [],
        })
      : { allowed: false, reasons: ['NO_PROFESSIONAL_PROFILE'] };

    if (!professional || !decision.allowed) {
      await this.audit(this.prisma, {
        petId: consultation.petId,
        actorUserId: auth.user.id,
        action: 'vet.prescription.denied',
        result: 'DENIED',
        resourceType: 'CONSULTATION',
        resourceId: consultation.id,
        metadata: { reasons: decision.reasons },
      });
      throw new ForbiddenException({
        message: 'No cuentas con habilitación vigente para recetar a animales',
        reasons: decision.reasons,
      });
    }

    const professionalProfileId = professional.id;
    const key = dto.idempotencyKey?.trim() || null;
    const findExisting = () =>
      this.prisma.vetPrescription.findFirst({
        where: {
          consultationId: consultation.id,
          idempotencyKey: key,
          veterinarianUserId: auth.user.id,
        },
        include: { items: true },
      });

    if (key) {
      const existing = await findExisting();
      if (existing) return { ...existing, idempotentReplay: true };
    }

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const prescription = await tx.vetPrescription.create({
          data: {
            petId: consultation.petId,
            consultationId: consultation.id,
            veterinarianUserId: auth.user.id,
            professionalProfileId,
            status: 'ACTIVE',
            issuedAt,
            idempotencyKey: key,
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
        await this.audit(tx, {
          petId: consultation.petId,
          actorUserId: auth.user.id,
          action: 'vet.prescription.issued',
          resourceType: 'PRESCRIPTION',
          resourceId: prescription.id,
          metadata: { items: dto.items.length },
        });
        return prescription;
      });
    } catch (error: unknown) {
      // Doble envío simultáneo con la misma clave: devolver la receta ya creada.
      if (key && (error as { code?: string } | null)?.code === 'P2002') {
        const existing = await findExisting();
        if (existing) return { ...existing, idempotentReplay: true };
      }
      throw error;
    }
  }

  async listPrescriptions(auth: AuthContext, petId: string) {
    const guardian = await this.prisma.vetPetGuardian.findFirst({
      where: { petId, userId: auth.user.id, status: 'ACTIVE', pet: { active: true } },
    });

    if (guardian && isGuardianActive(guardian)) {
      return this.prisma.vetPrescription.findMany({
        where: { petId },
        include: { items: true },
        orderBy: { issuedAt: 'desc' },
        take: 100,
      });
    }

    // Veterinario asignado: solo ve las recetas que él mismo emitió.
    const assigned = await this.prisma.vetConsultation.findFirst({
      where: { petId, veterinarianUserId: auth.user.id, pet: { active: true } },
      select: { id: true },
    });
    if (!assigned) throw new NotFoundException('Mascota no encontrada');

    return this.prisma.vetPrescription.findMany({
      where: { petId, veterinarianUserId: auth.user.id },
      include: { items: true },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
  }
}
