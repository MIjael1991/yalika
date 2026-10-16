import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  CLINICAL_ALLOWED_MIME,
  CLINICAL_EVENT_KINDS,
  CLINICAL_MAX_UPLOAD_BYTES,
  CLINICAL_SHARE_PERMISSIONS,
} from './clinical.constants';
import { ClinicalStorageService } from './clinical-storage.service';
import type { CreateClinicalEventDto } from './dto/create-clinical-event.dto';
import type { CreatePatientPrescriptionDto } from './dto/create-prescription.dto';
import type { CreateShareLinkDto } from './dto/create-share-link.dto';
import {
  clampExpiry,
  createOpaqueToken,
  detectAllowedMime,
  normalizeText,
  sha256,
  stringArray,
  tokenPrefix,
} from './clinical.utils';

type UploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
  ) {}

  private async profileForOwner(ownerUserId: string) {
    return this.prisma.clinicalProfile.upsert({
      where: { ownerUserId },
      update: {},
      create: { ownerUserId },
    });
  }

  private async requireOwnedProfile(ownerUserId: string) {
    const profile = await this.prisma.clinicalProfile.findUnique({
      where: { ownerUserId },
    });
    if (!profile) throw new NotFoundException('Perfil clínico no encontrado');
    return profile;
  }

  private async audit(input: {
    profileId: string;
    actorUserId: string;
    action: string;
    result: 'ALLOWED' | 'DENIED' | 'RECORDED';
    resourceType?: string;
    resourceId?: string;
    purpose?: string;
    grantId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.clinicalAuditEvent.create({
      data: {
        profileId: input.profileId,
        actorUserId: input.actorUserId,
        action: input.action,
        result: input.result,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        purpose: input.purpose,
        grantId: input.grantId,
        metadata: (input.metadata ?? undefined) as any,
      },
    });
  }


  private buildDemoPdf(): Buffer {
    const text = 'Yalika Salud - documento demostrativo - NO contiene datos medicos reales.';
    const escape = (value: string) =>
      value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

    const contentStream = `BT /F1 14 Tf 72 720 Td (${escape(text)}) Tj ET\n`;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    objects.forEach((object, index) => {
      offsets[index + 1] = Buffer.byteLength(pdf, 'utf8');
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }

  async seedDemo(ownerUserId: string) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.CLINICAL_DEMO_ENABLED !== 'true'
    ) {
      throw new NotFoundException('Modo demo no habilitado');
    }

    const profile = await this.profileForOwner(ownerUserId);
    const now = new Date();
    const atOffset = (days: number, hour = 10) => {
      const value = new Date(now);
      value.setDate(value.getDate() + days);
      value.setHours(hour, 0, 0, 0);
      return value;
    };

    const demoPdf = this.buildDemoPdf();
    const digest = sha256(demoPdf);

    let document = await this.prisma.clinicalDocument.findFirst({
      where: {
        profileId: profile.id,
        sha256: digest,
        deletedAt: null,
      },
    });

    if (!document) {
      const documentId = randomUUID();
      const storageKey = await this.storage.saveOriginal(
        profile.id,
        documentId,
        demoPdf,
      );

      try {
        document = await this.prisma.$transaction(async (tx: any) => {
          const created = await tx.clinicalDocument.create({
            data: {
              id: documentId,
              profileId: profile.id,
              title: 'DEMO · Biometría hemática',
              documentType: 'STUDY',
              originalName: 'demo-biometria-yalika.pdf',
              mimeType: 'application/pdf',
              byteSize: demoPdf.length,
              sha256: digest,
              storageKey,
              source: 'DEMO_FIXTURE',
              verificationStatus: 'UNVERIFIED',
              clinicalDate: atOffset(-5, 9),
              createdByUserId: ownerUserId,
            },
          });

          await tx.clinicalDocumentVersion.create({
            data: {
              documentId: created.id,
              versionNumber: 1,
              storageKey,
              sha256: digest,
              mimeType: 'application/pdf',
              byteSize: demoPdf.length,
              kind: 'ORIGINAL',
              createdByUserId: ownerUserId,
            },
          });

          await tx.clinicalTimelineEvent.create({
            data: {
              profileId: profile.id,
              kind: 'DOCUMENT',
              title: 'DEMO · Biometría hemática',
              status: 'COMPLETED',
              occurredAt: atOffset(-5, 9),
              resourceType: 'DOCUMENT',
              resourceId: created.id,
              source: 'DEMO_FIXTURE',
              verificationStatus: 'UNVERIFIED',
              metadata: { demo: true, demoPack: 'R25' },
              createdByUserId: ownerUserId,
            },
          });

          return created;
        });
      } catch (error) {
        await this.storage.remove(storageKey);
        throw error;
      }
    }

    if (!document) {
      throw new Error('No fue posible preparar el documento demo');
    }
    const demoDocumentId = document.id;

    const demoEvents = [
      {
        kind: 'APPOINTMENT',
        title: 'DEMO · Consulta general',
        status: 'COMPLETED',
        occurredAt: atOffset(-8, 11),
      },
      {
        kind: 'VACCINE',
        title: 'DEMO · Vacuna registrada',
        status: 'COMPLETED',
        occurredAt: atOffset(-35, 16),
      },
      {
        kind: 'FOLLOW_UP',
        title: 'DEMO · Seguimiento programado',
        status: 'SCHEDULED',
        occurredAt: atOffset(4, 10),
      },
    ];

    for (const event of demoEvents) {
      const exists = await this.prisma.clinicalTimelineEvent.findFirst({
        where: {
          profileId: profile.id,
          title: event.title,
        },
      });

      if (!exists) {
        await this.prisma.clinicalTimelineEvent.create({
          data: {
            profileId: profile.id,
            ...event,
            source: 'DEMO_FIXTURE',
            verificationStatus: 'UNVERIFIED',
            metadata: { demo: true, demoPack: 'R25' },
            createdByUserId: ownerUserId,
          },
        });
      }
    }

    let prescription = await this.prisma.clinicalPrescription.findFirst({
      where: {
        profileId: profile.id,
        source: 'DEMO_FIXTURE',
      },
      include: { items: true },
    });

    if (!prescription) {
      prescription = await this.prisma.clinicalPrescription.create({
        data: {
          profileId: profile.id,
          source: 'DEMO_FIXTURE',
          verificationStatus: 'UNVERIFIED',
          status: 'ACTIVE',
          prescriberName: 'Profesional de ejemplo',
          institutionName: 'Clínica Demo Yalika',
          issuedAt: atOffset(-7, 12),
          createdByUserId: ownerUserId,
          items: {
            create: [
              {
                medicationName: 'Medicamento demostrativo A',
                dosageText: 'Texto de ejemplo',
                frequencyText: 'Frecuencia de ejemplo',
                instructions:
                  'Contenido ficticio para probar la interfaz. No usar como indicación médica.',
                sortOrder: 0,
              },
            ],
          },
        },
        include: { items: true },
      });

      await this.prisma.clinicalTimelineEvent.create({
        data: {
          profileId: profile.id,
          kind: 'PRESCRIPTION',
          title: 'DEMO · Receta de ejemplo',
          status: 'COMPLETED',
          occurredAt: atOffset(-7, 12),
          resourceType: 'PRESCRIPTION',
          resourceId: prescription.id,
          source: 'DEMO_FIXTURE',
          verificationStatus: 'UNVERIFIED',
          metadata: { demo: true, demoPack: 'R25' },
          createdByUserId: ownerUserId,
        },
      });
    }

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.demo.seeded',
      result: 'RECORDED',
      metadata: {
        demo: true,
        demoPack: 'R25',
        documentId: demoDocumentId,
        prescriptionId: prescription.id,
      },
    });

    const [events, documents, prescriptions] = await Promise.all([
      this.prisma.clinicalTimelineEvent.count({
        where: { profileId: profile.id, title: { startsWith: 'DEMO ·' } },
      }),
      this.prisma.clinicalDocument.count({
        where: { profileId: profile.id, source: 'DEMO_FIXTURE', deletedAt: null },
      }),
      this.prisma.clinicalPrescription.count({
        where: { profileId: profile.id, source: 'DEMO_FIXTURE' },
      }),
    ]);

    return {
      demo: true,
      demoPack: 'R25',
      documentId: demoDocumentId,
      counts: { events, documents, prescriptions },
      message:
        'Demo ficticia cargada. Ya puedes probar historial, calendario, documentos, receta, QR y auditoría.',
    };
  }

  async dashboard(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    const now = new Date();
    const [recentEvents, recentDocuments, incomingRequests, activeGrants] =
      await Promise.all([
        this.prisma.clinicalTimelineEvent.findMany({
          where: { profileId: profile.id },
          orderBy: { occurredAt: 'desc' },
          take: 8,
        }),
        this.prisma.clinicalDocument.findMany({
          where: { profileId: profile.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            title: true,
            documentType: true,
            clinicalDate: true,
            verificationStatus: true,
            createdAt: true,
          },
        }),
        this.incomingRequests(ownerUserId),
        this.prisma.clinicalAccessGrant.findMany({
          where: {
            profileId: profile.id,
            status: 'ACTIVE',
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    return {
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        completeness: 'INCOMPLETE',
      },
      recentEvents,
      recentDocuments,
      incomingRequests: incomingRequests.filter((r: any) => r.status === 'PENDING'),
      activeGrants,
    };
  }

  async timeline(
    ownerUserId: string,
    query: { from?: string; to?: string; kind?: string },
  ) {
    const profile = await this.profileForOwner(ownerUserId);
    if (query.kind && !CLINICAL_EVENT_KINDS.has(query.kind)) {
      throw new BadRequestException('Tipo de evento inválido');
    }

    const occurredAt: { gte?: Date; lte?: Date } = {};
    if (query.from) occurredAt.gte = new Date(query.from);
    if (query.to) occurredAt.lte = new Date(query.to);

    return this.prisma.clinicalTimelineEvent.findMany({
      where: {
        profileId: profile.id,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.from || query.to ? { occurredAt } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }

  async createEvent(ownerUserId: string, dto: CreateClinicalEventDto) {
    const profile = await this.profileForOwner(ownerUserId);
    const event = await this.prisma.clinicalTimelineEvent.create({
      data: {
        profileId: profile.id,
        kind: dto.kind,
        title: dto.title.trim(),
        status: dto.status ?? 'SCHEDULED',
        occurredAt: new Date(dto.occurredAt),
        source: 'PATIENT',
        verificationStatus: 'UNVERIFIED',
        createdByUserId: ownerUserId,
      },
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.event.created',
      result: 'RECORDED',
      resourceType: 'TIMELINE_EVENT',
      resourceId: event.id,
    });
    return event;
  }

  async listDocuments(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    return this.prisma.clinicalDocument.findMany({
      where: { profileId: profile.id, deletedAt: null },
      orderBy: [{ clinicalDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        documentType: true,
        originalName: true,
        mimeType: true,
        byteSize: true,
        sha256: true,
        source: true,
        verificationStatus: true,
        clinicalDate: true,
        createdAt: true,
      },
    });
  }

  async uploadDocument(
    ownerUserId: string,
    input: {
      title: string;
      documentType: string;
      clinicalDate?: string;
      file?: UploadFile;
    },
  ) {
    const profile = await this.profileForOwner(ownerUserId);
    const file = input.file;
    if (!file) throw new BadRequestException('Selecciona un archivo');
    if (!CLINICAL_ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }
    const detectedMime = detectAllowedMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw new BadRequestException('El contenido del archivo no coincide con su tipo declarado');
    }
    if (file.size <= 0 || file.size > CLINICAL_MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Tamaño de archivo no permitido');
    }
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('El título es obligatorio');

    const digest = sha256(file.buffer);
    const duplicate = await this.prisma.clinicalDocument.findFirst({
      where: { profileId: profile.id, sha256: digest, deletedAt: null },
      select: { id: true, title: true, createdAt: true },
    });
    if (duplicate) {
      return { duplicate: true, document: duplicate };
    }

    const documentId = randomUUID();
    let storageKey: string | null = null;
    try {
      const savedStorageKey = await this.storage.saveOriginal(
        profile.id,
        documentId,
        file.buffer,
      );
      storageKey = savedStorageKey;

      const document = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.clinicalDocument.create({
          data: {
            id: documentId,
            profileId: profile.id,
            title,
            documentType: input.documentType?.trim() || 'OTHER',
            originalName: file.originalname,
            mimeType: file.mimetype,
            byteSize: file.size,
            sha256: digest,
            storageKey: savedStorageKey,
            source: 'PATIENT_PROVIDED',
            verificationStatus: 'UNVERIFIED',
            clinicalDate: input.clinicalDate
              ? new Date(input.clinicalDate)
              : null,
            createdByUserId: ownerUserId,
          },
        });
        await tx.clinicalDocumentVersion.create({
          data: {
            documentId: created.id,
            versionNumber: 1,
            storageKey: savedStorageKey,
            sha256: digest,
            mimeType: file.mimetype,
            byteSize: file.size,
            kind: 'ORIGINAL',
            createdByUserId: ownerUserId,
          },
        });
        await tx.clinicalTimelineEvent.create({
          data: {
            profileId: profile.id,
            kind: 'DOCUMENT',
            title,
            status: 'COMPLETED',
            occurredAt: input.clinicalDate
              ? new Date(input.clinicalDate)
              : new Date(),
            resourceType: 'DOCUMENT',
            resourceId: created.id,
            source: 'PATIENT',
            verificationStatus: 'UNVERIFIED',
            createdByUserId: ownerUserId,
          },
        });
        return created;
      });

      await this.audit({
        profileId: profile.id,
        actorUserId: ownerUserId,
        action: 'clinical.document.uploaded',
        result: 'RECORDED',
        resourceType: 'DOCUMENT',
        resourceId: document.id,
        metadata: { mimeType: file.mimetype, byteSize: file.size },
      });
      return { duplicate: false, document };
    } catch (error) {
      if (storageKey) await this.storage.remove(storageKey);
      throw error;
    }
  }

  async ownDocument(ownerUserId: string, documentId: string) {
    const profile = await this.requireOwnedProfile(ownerUserId);
    const document = await this.prisma.clinicalDocument.findFirst({
      where: { id: documentId, profileId: profile.id, deletedAt: null },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.document.read',
      result: 'ALLOWED',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
    });

    return {
      document,
      content: await this.storage.read(document.storageKey),
    };
  }

  async listPrescriptions(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    return this.prisma.clinicalPrescription.findMany({
      where: { profileId: profile.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  async createPatientPrescription(
    ownerUserId: string,
    dto: CreatePatientPrescriptionDto,
  ) {
    const profile = await this.profileForOwner(ownerUserId);
    if (!dto.items.length) {
      throw new BadRequestException('Agrega al menos un elemento');
    }

    if (dto.documentId) {
      const document = await this.prisma.clinicalDocument.findFirst({
        where: {
          id: dto.documentId,
          profileId: profile.id,
          deletedAt: null,
        },
      });
      if (!document) throw new BadRequestException('Documento no válido');
    }

    const prescription = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.clinicalPrescription.create({
        data: {
          profileId: profile.id,
          documentId: dto.documentId ?? null,
          source: 'PATIENT_PROVIDED',
          verificationStatus: 'UNVERIFIED',
          status: 'ACTIVE',
          prescriberName: dto.prescriberName?.trim() || null,
          institutionName: dto.institutionName?.trim() || null,
          issuedAt: new Date(dto.issuedAt),
          createdByUserId: ownerUserId,
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
          profileId: profile.id,
          kind: 'PRESCRIPTION',
          title: `Receta registrada · ${dto.items.length} elemento(s)`,
          status: 'COMPLETED',
          occurredAt: new Date(dto.issuedAt),
          resourceType: 'PRESCRIPTION',
          resourceId: created.id,
          source: 'PATIENT',
          verificationStatus: 'UNVERIFIED',
          createdByUserId: ownerUserId,
        },
      });
      return created;
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.prescription.patient_recorded',
      result: 'RECORDED',
      resourceType: 'PRESCRIPTION',
      resourceId: prescription.id,
    });
    return prescription;
  }

  private validateSharePermissions(permissions: string[]) {
    const unique = [...new Set(permissions)];
    if (!unique.length) throw new BadRequestException('Selecciona un permiso');
    for (const permission of unique) {
      if (!CLINICAL_SHARE_PERMISSIONS.has(permission)) {
        throw new BadRequestException(`Permiso no permitido: ${permission}`);
      }
    }
    return unique;
  }

  async createShareLink(ownerUserId: string, dto: CreateShareLinkDto) {
    const profile = await this.profileForOwner(ownerUserId);
    const resourceIds = [...new Set(dto.resourceIds)];
    if (!resourceIds.length) {
      throw new BadRequestException('Selecciona al menos un documento');
    }
    const count = await this.prisma.clinicalDocument.count({
      where: {
        profileId: profile.id,
        deletedAt: null,
        id: { in: resourceIds },
      },
    });
    if (count !== resourceIds.length) {
      throw new BadRequestException('Uno o más documentos no pertenecen al perfil');
    }

    const permissions = this.validateSharePermissions(dto.permissions);
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + dto.expiresInMinutes * 60_000);
    const shareLink = await this.prisma.clinicalShareLink.create({
      data: {
        profileId: profile.id,
        tokenHash: sha256(token),
        tokenPrefix: tokenPrefix(token),
        resources: resourceIds,
        permissions,
        purpose: dto.purpose?.trim() || null,
        maxUses: 1,
        expiresAt,
        createdByUserId: ownerUserId,
      },
      select: {
        id: true,
        tokenPrefix: true,
        permissions: true,
        purpose: true,
        expiresAt: true,
        status: true,
      },
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.share_link.created',
      result: 'RECORDED',
      resourceType: 'SHARE_LINK',
      resourceId: shareLink.id,
      purpose: dto.purpose,
      metadata: { resourceCount: resourceIds.length, permissions },
    });

    return {
      shareLink,
      token,
      relativePath: `/salud/acceso?token=${encodeURIComponent(token)}`,
    };
  }

  async requestAccess(requesterUserId: string, token: string) {
    const tokenHash = sha256(token);
    const shareLink = await this.prisma.clinicalShareLink.findUnique({
      where: { tokenHash },
    });
    if (
      !shareLink ||
      shareLink.status !== 'ACTIVE' ||
      shareLink.revokedAt ||
      shareLink.expiresAt <= new Date() ||
      shareLink.usedCount >= shareLink.maxUses
    ) {
      throw new NotFoundException('Enlace inválido, vencido o ya utilizado');
    }
    const profile = await this.prisma.clinicalProfile.findUnique({
      where: { id: shareLink.profileId },
    });
    if (!profile) throw new NotFoundException('Perfil no encontrado');
    if (profile.ownerUserId === requesterUserId) {
      throw new BadRequestException('No puedes solicitar acceso a tu propio enlace');
    }

    const request = await this.prisma.clinicalAccessRequest.upsert({
      where: {
        shareLinkId_requesterUserId: {
          shareLinkId: shareLink.id,
          requesterUserId,
        },
      },
      update: {},
      create: {
        shareLinkId: shareLink.id,
        requesterUserId,
      },
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: requesterUserId,
      action: 'clinical.access.requested',
      result: 'RECORDED',
      resourceType: 'ACCESS_REQUEST',
      resourceId: request.id,
      purpose: shareLink.purpose ?? undefined,
    });
    return {
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt,
      purpose: shareLink.purpose,
    };
  }

  async ownerShareLinks(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    return this.prisma.clinicalShareLink.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        tokenPrefix: true,
        permissions: true,
        purpose: true,
        status: true,
        usedCount: true,
        maxUses: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeShareLink(ownerUserId: string, linkId: string) {
    const profile = await this.requireOwnedProfile(ownerUserId);
    const link = await this.prisma.clinicalShareLink.findFirst({
      where: { id: linkId, profileId: profile.id },
    });
    if (!link) throw new NotFoundException('Enlace no encontrado');

    const result = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.clinicalShareLink.update({
        where: { id: link.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      const grants = await tx.clinicalAccessGrant.findMany({
        where: { shareLinkId: link.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (grants.length) {
        await tx.clinicalAccessGrant.updateMany({
          where: { id: { in: grants.map((g: any) => g.id) } },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
        await tx.clinicalAccessSession.updateMany({
          where: {
            grantId: { in: grants.map((g: any) => g.id) },
            status: 'ACTIVE',
          },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
      }
      await tx.clinicalAccessRequest.updateMany({
        where: { shareLinkId: link.id, status: 'PENDING' },
        data: {
          status: 'DENIED',
          decidedAt: new Date(),
          decidedByUserId: ownerUserId,
        },
      });
      return updated;
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.share_link.revoked',
      result: 'ALLOWED',
      resourceType: 'SHARE_LINK',
      resourceId: link.id,
    });
    return result;
  }

  async incomingRequests(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    const links = await this.prisma.clinicalShareLink.findMany({
      where: { profileId: profile.id },
      select: { id: true, purpose: true, expiresAt: true, permissions: true },
    });
    if (!links.length) return [];
    const linkMap = new Map(links.map((link: any) => [link.id, link]));
    const requests = await this.prisma.clinicalAccessRequest.findMany({
      where: { shareLinkId: { in: links.map((l: any) => l.id) } },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return requests.map((request: any) => ({
      ...request,
      share: linkMap.get(request.shareLinkId),
    }));
  }

  async denyRequest(ownerUserId: string, requestId: string) {
    const profile = await this.requireOwnedProfile(ownerUserId);
    const request = await this.prisma.clinicalAccessRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('Solicitud pendiente no encontrada');
    }
    const shareLink = await this.prisma.clinicalShareLink.findUnique({
      where: { id: request.shareLinkId },
    });
    if (!shareLink || shareLink.profileId !== profile.id) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    const denied = await this.prisma.clinicalAccessRequest.update({
      where: { id: request.id },
      data: {
        status: 'DENIED',
        decidedAt: new Date(),
        decidedByUserId: ownerUserId,
      },
    });
    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.access.denied',
      result: 'ALLOWED',
      resourceType: 'ACCESS_REQUEST',
      resourceId: request.id,
    });
    return denied;
  }

  async approveRequest(ownerUserId: string, requestId: string) {
    const profile = await this.requireOwnedProfile(ownerUserId);
    const request = await this.prisma.clinicalAccessRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException('Solicitud pendiente no encontrada');
    }
    const shareLink = await this.prisma.clinicalShareLink.findUnique({
      where: { id: request.shareLinkId },
    });
    if (!shareLink || shareLink.profileId !== profile.id) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (
      shareLink.status !== 'ACTIVE' ||
      shareLink.revokedAt ||
      shareLink.expiresAt <= new Date() ||
      shareLink.usedCount >= shareLink.maxUses
    ) {
      throw new BadRequestException('El enlace ya no está vigente');
    }

    const grant = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.clinicalAccessGrant.create({
        data: {
          profileId: profile.id,
          shareLinkId: shareLink.id,
          accessRequestId: request.id,
          granteeUserId: request.requesterUserId,
          resources: shareLink.resources,
          permissions: shareLink.permissions,
          purpose: shareLink.purpose,
          startsAt: new Date(),
          expiresAt: shareLink.expiresAt,
          createdByUserId: ownerUserId,
        },
      });
      await tx.clinicalAccessRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          decidedAt: new Date(),
          decidedByUserId: ownerUserId,
        },
      });
      await tx.clinicalShareLink.update({
        where: { id: shareLink.id },
        data: {
          usedCount: { increment: 1 },
          ...(shareLink.maxUses <= shareLink.usedCount + 1
            ? { status: 'USED' }
            : {}),
        },
      });
      return created;
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.access.approved',
      result: 'ALLOWED',
      resourceType: 'ACCESS_GRANT',
      resourceId: grant.id,
      grantId: grant.id,
      purpose: grant.purpose ?? undefined,
    });
    return grant;
  }

  async ownerGrants(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    return this.prisma.clinicalAccessGrant.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async revokeGrant(ownerUserId: string, grantId: string) {
    const profile = await this.requireOwnedProfile(ownerUserId);
    const grant = await this.prisma.clinicalAccessGrant.findFirst({
      where: { id: grantId, profileId: profile.id },
    });
    if (!grant) throw new NotFoundException('Acceso no encontrado');
    if (grant.status === 'REVOKED') return grant;

    const revoked = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.clinicalAccessGrant.update({
        where: { id: grant.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await tx.clinicalAccessSession.updateMany({
        where: { grantId: grant.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      return updated;
    });

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.access.revoked',
      result: 'ALLOWED',
      resourceType: 'ACCESS_GRANT',
      resourceId: grant.id,
      grantId: grant.id,
    });
    return revoked;
  }

  async viewerGrants(viewerUserId: string) {
    return this.prisma.clinicalAccessGrant.findMany({
      where: {
        granteeUserId: viewerUserId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        permissions: true,
        purpose: true,
        startsAt: true,
        expiresAt: true,
        status: true,
      },
    });
  }

  async createAccessSession(viewerUserId: string, grantId: string) {
    const grant = await this.prisma.clinicalAccessGrant.findFirst({
      where: {
        id: grantId,
        granteeUserId: viewerUserId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });
    if (!grant) throw new ForbiddenException('Acceso no autorizado');
    const expiresAt = clampExpiry(45, grant.expiresAt);
    const session = await this.prisma.clinicalAccessSession.create({
      data: {
        grantId: grant.id,
        viewerUserId,
        expiresAt,
      },
    });
    await this.audit({
      profileId: grant.profileId,
      actorUserId: viewerUserId,
      action: 'clinical.access.session_created',
      result: 'ALLOWED',
      resourceType: 'ACCESS_SESSION',
      resourceId: session.id,
      grantId: grant.id,
      purpose: grant.purpose ?? undefined,
    });
    return session;
  }

  private async requireSession(
    viewerUserId: string,
    sessionId: string,
    requiredPermission: 'VIEW' | 'DOWNLOAD',
  ) {
    const session = await this.prisma.clinicalAccessSession.findFirst({
      where: {
        id: sessionId,
        viewerUserId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });
    if (!session) throw new ForbiddenException('Sesión de acceso no válida');
    const grant = await this.prisma.clinicalAccessGrant.findFirst({
      where: {
        id: session.grantId,
        granteeUserId: viewerUserId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });
    if (!grant) throw new ForbiddenException('Acceso revocado o vencido');
    const permissions = stringArray(grant.permissions);
    if (!permissions.includes(requiredPermission)) {
      await this.audit({
        profileId: grant.profileId,
        actorUserId: viewerUserId,
        action: `clinical.${requiredPermission.toLowerCase()}.denied`,
        result: 'DENIED',
        grantId: grant.id,
      });
      throw new ForbiddenException('El permiso no incluye esta operación');
    }
    await this.prisma.clinicalAccessSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    return { session, grant, resources: stringArray(grant.resources) };
  }

  async sharedDocuments(viewerUserId: string, sessionId: string) {
    const { grant, resources } = await this.requireSession(
      viewerUserId,
      sessionId,
      'VIEW',
    );
    const documents = await this.prisma.clinicalDocument.findMany({
      where: {
        profileId: grant.profileId,
        id: { in: resources },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        documentType: true,
        mimeType: true,
        byteSize: true,
        source: true,
        verificationStatus: true,
        clinicalDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    await this.audit({
      profileId: grant.profileId,
      actorUserId: viewerUserId,
      action: 'clinical.shared_documents.listed',
      result: 'ALLOWED',
      grantId: grant.id,
      metadata: { count: documents.length },
    });
    return documents;
  }

  async sharedDocumentDownload(
    viewerUserId: string,
    sessionId: string,
    documentId: string,
  ) {
    const { grant, resources } = await this.requireSession(
      viewerUserId,
      sessionId,
      'DOWNLOAD',
    );
    if (!resources.includes(documentId)) {
      throw new ForbiddenException('Documento fuera del alcance autorizado');
    }
    const document = await this.prisma.clinicalDocument.findFirst({
      where: {
        id: documentId,
        profileId: grant.profileId,
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    await this.audit({
      profileId: grant.profileId,
      actorUserId: viewerUserId,
      action: 'clinical.document.downloaded',
      result: 'ALLOWED',
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      grantId: grant.id,
    });
    return {
      document,
      content: await this.storage.read(document.storageKey),
    };
  }

  async auditLog(ownerUserId: string) {
    const profile = await this.profileForOwner(ownerUserId);
    return this.prisma.clinicalAuditEvent.findMany({
      where: { profileId: profile.id },
      orderBy: { occurredAt: 'desc' },
      take: 300,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        result: true,
        purpose: true,
        occurredAt: true,
      },
    });
  }

  async assistant(ownerUserId: string, query: string) {
    const profile = await this.profileForOwner(ownerUserId);
    const normalized = normalizeText(query);
    const [documents, prescriptions, events] = await Promise.all([
      this.prisma.clinicalDocument.findMany({
        where: { profileId: profile.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          documentType: true,
          clinicalDate: true,
          createdAt: true,
          verificationStatus: true,
        },
      }),
      this.prisma.clinicalPrescription.findMany({
        where: { profileId: profile.id },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { issuedAt: 'desc' },
        take: 50,
      }),
      this.prisma.clinicalTimelineEvent.findMany({
        where: { profileId: profile.id },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
    ]);

    const words = normalized
      .split(/\s+/)
      .filter((word) => word.length >= 3)
      .slice(0, 12);

    const scoredDocuments = documents
      .map((doc: any) => {
        const haystack = normalizeText(`${doc.title} ${doc.documentType}`);
        const score = words.filter((word) => haystack.includes(word)).length;
        return { doc, score };
      })
      .filter((item: any) => item.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 8);

    const wantsPrescription =
      normalized.includes('receta') || normalized.includes('medicamento');
    const wantsSchedule =
      normalized.includes('cita') ||
      normalized.includes('calendario') ||
      normalized.includes('semana') ||
      normalized.includes('proximo');

    const sources: Array<Record<string, unknown>> = [];
    for (const item of scoredDocuments) {
      sources.push({
        type: 'DOCUMENT',
        id: item.doc.id,
        title: item.doc.title,
        date: item.doc.clinicalDate ?? item.doc.createdAt,
        verificationStatus: item.doc.verificationStatus,
      });
    }
    if (wantsPrescription) {
      for (const rx of prescriptions.slice(0, 5) as any[]) {
        sources.push({
          type: 'PRESCRIPTION',
          id: rx.id,
          title: `Receta · ${rx.items.length} elemento(s)`,
          date: rx.issuedAt,
          verificationStatus: rx.verificationStatus,
        });
      }
    }
    if (wantsSchedule) {
      for (const event of (events as any[])
        .filter((event) => ['APPOINTMENT', 'STUDY', 'FOLLOW_UP'].includes(event.kind))
        .slice(0, 8)) {
        sources.push({
          type: 'EVENT',
          id: event.id,
          title: event.title,
          date: event.occurredAt,
          verificationStatus: event.verificationStatus,
        });
      }
    }

    const uniqueSources = Array.from(
      new Map(sources.map((source) => [`${source.type}:${source.id}`, source])).values(),
    ).slice(0, 12);

    const message = uniqueSources.length
      ? `Encontré ${uniqueSources.length} registro(s) relacionado(s). Revisa las fuentes antes de compartir o tomar una decisión.`
      : 'No encontré información suficiente en tu expediente registrado. No voy a inventar datos.';

    await this.audit({
      profileId: profile.id,
      actorUserId: ownerUserId,
      action: 'clinical.assistant.searched',
      result: 'RECORDED',
      metadata: { sourceCount: uniqueSources.length },
    });

    return {
      mode: 'DOCUMENTARY',
      message,
      sources: uniqueSources,
      warning:
        'Yalika organiza información registrada; no diagnostica ni modifica tratamientos.',
    };
  }
}
