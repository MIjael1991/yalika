import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CredentialDto, ReviewDecisionDto } from './dto/presente.dto';
import { PresenteStorageService } from './presente-storage.service';
import { readFileDataUrl } from './presente-invoice.domain';
import {
  CREDENTIAL_TRADES,
  SEP_CERTIFICATE_URL,
  SEP_LICENSE_LOOKUP_URL,
  SEP_PROOF_MAX_BYTES,
} from './presente.constants';
import { parseImageDataUrl, sepProofState } from './presente.domain';

const IMAGE_MESSAGES: Record<string, string> = {
  FORMAT: 'La foto debe ser JPG, PNG o WEBP.',
  TOO_SMALL: 'La foto salió muy pequeña o borrosa. Tómala de nuevo.',
  TOO_LARGE: 'La foto es muy pesada. Tómala de nuevo con menos acercamiento.',
};

/**
 * Cédulas profesionales (ingeniería, contaduría, arquitectura, leyes, psicología...): la persona
 * manda el número, la foto de su título o cédula, una selfie con ella en mano y el comprobante de
 * la SEP (constancia en PDF con QR o captura de la consulta). El operador la revisa; al aprobarse,
 * la profesión se agrega a lo que ofrece. Las fotos se borran al decidir; el comprobante de la SEP
 * se queda y sus clientes lo pueden ver para comprobarlo ellos mismos.
 */
@Injectable()
export class PresenteCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PresenteStorageService,
  ) {}

  private async audit(
    providerId: string,
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.presenteAuditEvent.create({
      data: {
        providerId,
        actorUserId,
        action,
        metadata: metadata as Prisma.InputJsonObject,
      },
    });
  }

  private async myProvider(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
      include: { credentials: true },
    });
    if (!provider) {
      throw new NotFoundException('Primero llena tus datos de trabajo');
    }
    if (['WITHDRAWN', 'SUSPENDED'].includes(provider.status)) {
      throw new ForbiddenException('Tu cuenta de trabajo no está activa');
    }
    return provider;
  }

  private image(dataUrl: string) {
    const image = parseImageDataUrl(dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
    return image;
  }

  /** Constancia en PDF o captura de pantalla de la consulta. */
  private sepProofFile(dataUrl: string) {
    if (dataUrl.startsWith('data:application/pdf')) {
      const pdf = readFileDataUrl(dataUrl, 'pdf', SEP_PROOF_MAX_BYTES);
      if (!pdf) {
        throw new BadRequestException(
          'El comprobante debe ser el PDF de la SEP (máximo 3 MB) o una foto de la consulta',
        );
      }
      return { bytes: pdf.bytes, mimeType: pdf.mime };
    }
    const image = this.image(dataUrl);
    return { bytes: image.bytes, mimeType: image.mimeType };
  }

  async submit(auth: AuthContext, dto: CredentialDto) {
    if (!CREDENTIAL_TRADES.includes(dto.trade)) {
      throw new BadRequestException('Esa profesión no lleva cédula aquí');
    }
    const provider = await this.myProvider(auth);
    if (!provider.biometricConsentAt) {
      throw new ConflictException(
        'Primero da tu permiso para usar tu foto (la selfie con tu cédula)',
      );
    }
    const current = provider.credentials.find((c) => c.trade === dto.trade);
    if (current?.status === 'VERIFIED') {
      throw new ConflictException('Esa cédula ya está aprobada');
    }
    const title = this.image(dto.titlePhoto);
    const selfie = this.image(dto.selfiePhoto);
    const proof = this.sepProofFile(dto.sepProof);
    const titleKey = this.storage.newKey(provider.id, 'cedula');
    const selfieKey = this.storage.newKey(provider.id, 'selfie-cedula');
    const sepProofKey = this.storage.newKey(provider.id, 'comprobante-sep');
    await this.storage.put(titleKey, title.bytes);
    await this.storage.put(selfieKey, selfie.bytes);
    await this.storage.put(sepProofKey, proof.bytes);
    const data = {
      licenseNumber: dto.licenseNumber.trim(),
      status: 'PENDING',
      reviewNote: null,
      titleKey,
      titleMime: title.mimeType,
      selfieKey,
      selfieMime: selfie.mimeType,
      sepProofKey,
      sepProofMime: proof.mimeType,
      sepProofAt: new Date(),
      sepProofCheckedAt: null,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedByUserId: null,
    };
    await this.prisma.presenteCredential.upsert({
      where: {
        providerId_trade: { providerId: provider.id, trade: dto.trade },
      },
      create: { providerId: provider.id, trade: dto.trade, ...data },
      update: data,
    });
    for (const key of [
      current?.titleKey,
      current?.selfieKey,
      current?.sepProofKey,
    ]) {
      if (key) await this.storage.delete(key);
    }
    await this.audit(provider.id, auth.user.id, 'CREDENTIAL_SUBMITTED', {
      trade: dto.trade,
    });
    return this.mine(auth);
  }

  async mine(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
      include: { credentials: { orderBy: { submittedAt: 'desc' } } },
    });
    return (provider?.credentials ?? []).map((c) => ({
      trade: c.trade,
      licenseNumber: c.licenseNumber,
      status: c.status,
      reviewNote: c.reviewNote,
      submittedAt: c.submittedAt,
      reviewedAt: c.reviewedAt,
      sepProof: sepProofState(c),
    }));
  }

  /**
   * Subir o cambiar el comprobante de la SEP (para quien ya tenía su cédula sin él). Si la cédula
   * ya estaba aprobada, el comprobante nuevo espera revisión antes de que lo vean sus clientes.
   */
  async uploadSepProof(auth: AuthContext, trade: string, file: string) {
    const provider = await this.myProvider(auth);
    const credential = provider.credentials.find((c) => c.trade === trade);
    if (!credential || credential.status === 'REJECTED') {
      throw new NotFoundException('Primero manda tu cédula para esa profesión');
    }
    const proof = this.sepProofFile(file);
    const key = this.storage.newKey(provider.id, 'comprobante-sep');
    await this.storage.put(key, proof.bytes);
    await this.prisma.presenteCredential.update({
      where: { id: credential.id },
      data: {
        sepProofKey: key,
        sepProofMime: proof.mimeType,
        sepProofAt: new Date(),
        sepProofCheckedAt: null,
      },
    });
    if (credential.sepProofKey)
      await this.storage.delete(credential.sepProofKey);
    await this.audit(provider.id, auth.user.id, 'SEP_PROOF_SUBMITTED', {
      trade,
    });
    return this.mine(auth);
  }

  /** Para los clientes: el comprobante ya revisado de una cédula aprobada. */
  async publicSepProof(providerId: string, trade: string) {
    const credential = await this.prisma.presenteCredential.findUnique({
      where: { providerId_trade: { providerId, trade } },
      include: { provider: { select: { status: true } } },
    });
    if (
      !credential ||
      credential.status !== 'VERIFIED' ||
      credential.provider.status !== 'VERIFIED' ||
      !credential.sepProofKey ||
      !credential.sepProofMime ||
      !credential.sepProofCheckedAt
    ) {
      throw new NotFoundException('Ese comprobante no está disponible');
    }
    const bytes = await this.storage.get(credential.sepProofKey);
    return {
      mime: credential.sepProofMime,
      dataUrl: `data:${credential.sepProofMime};base64,${bytes.toString('base64')}`,
      licenseNumber: credential.licenseNumber,
      lookupUrl: SEP_LICENSE_LOOKUP_URL,
    };
  }

  /** Quitar una profesión con cédula: deja de ofrecerla y se borran sus fotos. */
  async remove(auth: AuthContext, trade: string) {
    const provider = await this.myProvider(auth);
    const credential = provider.credentials.find((c) => c.trade === trade);
    if (!credential) throw new NotFoundException('No tienes esa cédula');
    for (const key of [
      credential.titleKey,
      credential.selfieKey,
      credential.sepProofKey,
    ]) {
      if (key) await this.storage.delete(key);
    }
    await this.prisma.$transaction([
      this.prisma.presenteCredential.delete({ where: { id: credential.id } }),
      this.prisma.presenteProvider.update({
        where: { id: provider.id },
        data: { trades: provider.trades.filter((t) => t !== trade) },
      }),
    ]);
    await this.audit(provider.id, auth.user.id, 'CREDENTIAL_REMOVED', {
      trade,
    });
    return this.mine(auth);
  }

  // ---------- Operador ----------

  async listPending() {
    const rows = await this.prisma.presenteCredential.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          // Cédula ya aprobada que mandó (o cambió) su comprobante de la SEP.
          {
            status: 'VERIFIED',
            sepProofKey: { not: null },
            sepProofCheckedAt: null,
          },
        ],
      },
      include: { provider: true },
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    return rows.map((c) => ({
      id: c.id,
      providerId: c.providerId,
      displayName: c.provider.displayName,
      providerStatus: c.provider.status,
      trade: c.trade,
      licenseNumber: c.licenseNumber,
      submittedAt: c.status === 'PENDING' ? c.submittedAt : c.sepProofAt,
      // CREDENTIAL: cédula completa; SEP_PROOF: solo el comprobante nuevo.
      kind: c.status === 'PENDING' ? 'CREDENTIAL' : 'SEP_PROOF',
      sepProofMime: c.sepProofMime,
      lookupUrl: SEP_LICENSE_LOOKUP_URL,
      certificateUrl: SEP_CERTIFICATE_URL,
    }));
  }

  async photo(operatorUserId: string, id: string, which: string) {
    const credential = await this.prisma.presenteCredential.findUnique({
      where: { id },
    });
    const key =
      which === 'sep'
        ? credential?.sepProofKey
        : which === 'selfie'
          ? credential?.selfieKey
          : credential?.titleKey;
    const mime =
      which === 'sep'
        ? credential?.sepProofMime
        : which === 'selfie'
          ? credential?.selfieMime
          : credential?.titleMime;
    if (!credential || !key || !mime) {
      throw new NotFoundException('Esa foto ya no existe');
    }
    const bytes = await this.storage.get(key);
    await this.audit(credential.providerId, operatorUserId, 'DOCUMENT_VIEWED', {
      kind: `CEDULA_${which.toUpperCase()}`,
      trade: credential.trade,
    });
    return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  }

  async decide(operatorUserId: string, id: string, dto: ReviewDecisionDto) {
    const credential = await this.prisma.presenteCredential.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!credential) throw new NotFoundException('Cédula no encontrada');
    const proofOnly =
      credential.status === 'VERIFIED' &&
      Boolean(credential.sepProofKey) &&
      !credential.sepProofCheckedAt;
    if (credential.status !== 'PENDING' && !proofOnly) {
      throw new ConflictException('Esta cédula no está esperando revisión');
    }
    if (!dto.approve && !dto.note?.trim()) {
      throw new BadRequestException(
        'Escribe el motivo para que la persona sepa qué corregir',
      );
    }
    if (proofOnly) return this.decideSepProof(operatorUserId, credential, dto);
    for (const key of [
      credential.titleKey,
      credential.selfieKey,
      // Rechazada: tampoco se guarda su comprobante.
      dto.approve ? null : credential.sepProofKey,
    ]) {
      if (key) await this.storage.delete(key);
    }
    const trades = credential.provider.trades;
    await this.prisma.$transaction([
      this.prisma.presenteCredential.update({
        where: { id },
        data: {
          status: dto.approve ? 'VERIFIED' : 'REJECTED',
          reviewNote: dto.note?.trim() || null,
          reviewedAt: new Date(),
          reviewedByUserId: operatorUserId,
          titleKey: null,
          titleMime: null,
          selfieKey: null,
          selfieMime: null,
          ...(dto.approve
            ? {
                sepProofCheckedAt: credential.sepProofKey ? new Date() : null,
              }
            : { sepProofKey: null, sepProofMime: null, sepProofAt: null }),
        },
      }),
      ...(dto.approve && !trades.includes(credential.trade)
        ? [
            this.prisma.presenteProvider.update({
              where: { id: credential.providerId },
              data: { trades: [...trades, credential.trade] },
            }),
          ]
        : []),
    ]);
    await this.audit(
      credential.providerId,
      operatorUserId,
      dto.approve ? 'CREDENTIAL_APPROVED' : 'CREDENTIAL_REJECTED',
      { trade: credential.trade, note: dto.note?.trim() || undefined },
    );
    return { id, status: dto.approve ? 'VERIFIED' : 'REJECTED' };
  }

  /** Cédula ya aprobada: solo se revisa su comprobante nuevo de la SEP. */
  private async decideSepProof(
    operatorUserId: string,
    credential: {
      id: string;
      providerId: string;
      trade: string;
      sepProofKey: string | null;
    },
    dto: ReviewDecisionDto,
  ) {
    if (dto.approve) {
      await this.prisma.presenteCredential.update({
        where: { id: credential.id },
        data: { sepProofCheckedAt: new Date(), reviewNote: null },
      });
    } else {
      if (credential.sepProofKey) {
        await this.storage.delete(credential.sepProofKey);
      }
      await this.prisma.presenteCredential.update({
        where: { id: credential.id },
        data: {
          sepProofKey: null,
          sepProofMime: null,
          sepProofAt: null,
          sepProofCheckedAt: null,
          reviewNote: `Comprobante de la SEP: ${dto.note?.trim()}`,
        },
      });
    }
    await this.audit(
      credential.providerId,
      operatorUserId,
      dto.approve ? 'SEP_PROOF_APPROVED' : 'SEP_PROOF_REJECTED',
      { trade: credential.trade, note: dto.note?.trim() || undefined },
    );
    return { id: credential.id, status: 'VERIFIED' };
  }
}
