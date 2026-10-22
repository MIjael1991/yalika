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
import type {
  ReviewDecisionDto,
  SaveProviderProfileDto,
  UploadProviderDocumentDto,
} from './dto/presente.dto';
import { curpFingerprint, decryptText, encryptText } from './presente-crypto';
import { findMunicipality } from './geo/municipios';
import { ACTIVE_JOB, isSuspended } from './presente-job.domain';
import { PresenteStorageService } from './presente-storage.service';
import {
  commissionPctSetting,
  parseWalletCode,
  walletCode,
  welcomeCreditSetting,
  welcomeLimitSetting,
} from './presente-wallet.domain';
import { PresenteWalletService } from './presente-wallet.service';
import {
  CLINICAL_TRADES,
  PENDING_TRADES,
  PRESENTE_CONSENT_VERSION,
  RECHECK_DOCUMENT_KIND,
  TITLE_TRADES,
  CREDENTIAL_TRADES,
} from './presente.constants';
import {
  ageOn,
  buildAvailability,
  checkCurp,
  clinicalTradeAllowed,
  effectivePresence,
  identityRecheck,
  sepProofState,
  isAdultOn,
  isEditableStatus,
  maskCurp,
  missingForSubmit,
  parseImageDataUrl,
  readAvailability,
} from './presente.domain';

const providerInclude = { documents: true, credentials: true } as const;
type ProviderWithDocs = Prisma.PresenteProviderGetPayload<{
  include: typeof providerInclude;
}>;

/** Lo que se ve en el historial de cada quien (sin datos personales). */
const HISTORY_LABELS: Record<string, string> = {
  PROFILE_SAVED: 'Cambiaste tus datos de trabajo',
  CONSENT_GIVEN: 'Diste permiso para usar tu foto',
  CONSENT_WITHDRAWN: 'Quitaste el permiso de tu foto',
  DOCUMENT_UPLOADED: 'Subiste una foto de verificación',
  SUBMITTED: 'Mandaste tu registro a revisión',
  APPROVED: 'Yalika aprobó tu registro',
  REJECTED: 'Yalika pidió corregir tu registro',
  SUSPENDED: 'Tu cuenta de trabajo fue suspendida',
  WITHDRAWN: 'Te diste de baja',
  CAME_BACK: 'Volviste a ofrecer tus servicios',
  CREDENTIAL_SUBMITTED: 'Mandaste una cédula a revisión',
  CREDENTIAL_APPROVED: 'Yalika aprobó tu cédula',
  CREDENTIAL_REJECTED: 'Yalika pidió corregir tu cédula',
  CREDENTIAL_REMOVED: 'Quitaste una profesión con cédula',
  RECHECK_SENT: 'Mandaste tu selfie para revalidar tu identidad',
  RECHECK_APPROVED: 'Yalika confirmó que sigues siendo tú',
  RECHECK_REJECTED: 'Yalika pidió repetir tu selfie',
  PRESENT: 'Te pusiste Presente',
  ABSENT: 'Te pusiste Ausente',
};

const CURP_MESSAGES: Record<string, string> = {
  FORMAT:
    'La CURP no tiene el formato correcto. Revisa las 18 letras y números.',
  CHECK_DIGIT: 'La CURP no es válida: el último número no coincide. Revísala.',
  BIRTH_DATE: 'La fecha de nacimiento de la CURP no es válida.',
};

const IMAGE_MESSAGES: Record<string, string> = {
  FORMAT: 'La foto debe ser JPG, PNG o WEBP.',
  TOO_SMALL: 'La foto salió muy pequeña o borrosa. Tómala de nuevo.',
  TOO_LARGE: 'La foto es muy pesada. Tómala de nuevo con menos acercamiento.',
};

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class PresenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PresenteStorageService,
    private readonly wallet: PresenteWalletService,
  ) {}

  private async audit(
    providerId: string | null,
    actorUserId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.presenteAuditEvent.create({
      data: {
        providerId,
        actorUserId,
        action,
        metadata: (metadata as Prisma.InputJsonObject | undefined) ?? undefined,
      },
    });
  }

  private find(userId: string) {
    return this.prisma.presenteProvider.findUnique({
      where: { userId },
      include: providerInclude,
    });
  }

  private async requireEditable(userId: string) {
    const provider = await this.find(userId);
    if (!provider) {
      throw new NotFoundException('Primero llena tus datos de trabajo');
    }
    if (!isEditableStatus(provider.status)) {
      throw new ConflictException(
        provider.status === 'PENDING_REVIEW'
          ? 'Tu registro está en revisión; espera la respuesta para cambiarlo'
          : 'Tu registro ya fue revisado y no se puede cambiar aquí',
      );
    }
    return provider;
  }

  /** Lo que ve el trabajador de sí mismo. Nunca incluye la CURP completa ni las fotos. */
  view(provider: ProviderWithDocs, now = new Date()) {
    const kinds = provider.documents.map((doc) => doc.kind);
    const credentialTrades = provider.credentials
      .filter((c) => c.status !== 'REJECTED')
      .map((c) => c.trade);
    return {
      id: provider.id,
      displayName: provider.displayName,
      isBusiness: provider.isBusiness,
      businessName: provider.businessName,
      delivers: provider.delivers,
      teaches: provider.teaches,
      invoices: provider.invoices,
      bio: provider.bio,
      trades: provider.trades,
      zoneLabel: provider.zoneLabel,
      municipalityCode: provider.municipalityCode,
      municipalityName:
        findMunicipality(provider.municipalityCode)?.name ?? null,
      radiusKm: provider.radiusKm,
      availability: readAvailability(provider.availability),
      curpMasked: maskCurp(provider.curpLast4),
      status: provider.status,
      reviewNote: provider.reviewNote,
      consentGiven: Boolean(provider.biometricConsentAt),
      documents: kinds,
      // Quien solo ofrece profesiones con cédula (ingeniero, contador...) cuenta con ellas.
      missing: missingForSubmit(
        { ...provider, trades: [...provider.trades, ...credentialTrades] },
        kinds,
      ),
      credentials: provider.credentials.map((c) => ({
        trade: c.trade,
        licenseNumber: c.licenseNumber,
        status: c.status,
        reviewNote: c.reviewNote,
        submittedAt: c.submittedAt,
        reviewedAt: c.reviewedAt,
        sepProof: sepProofState(c),
      })),
      identityCheck: identityRecheck(
        provider,
        kinds.includes(RECHECK_DOCUMENT_KIND),
        now,
      ),
      presence: effectivePresence(provider, now),
      lastSeenAt: provider.lastSeenAt,
      submittedAt: provider.submittedAt,
      reviewedAt: provider.reviewedAt,
      commissionPct: commissionPctSetting(),
      welcomeCreditMxn: welcomeCreditSetting(),
      welcomeLimit: welcomeLimitSetting(),
      referralCode: walletCode(provider.id),
      referred: Boolean(provider.referredByProviderId),
      withdrawnAt: provider.withdrawnAt,
    };
  }

  async getMine(auth: AuthContext) {
    const provider = await this.find(auth.user.id);
    return provider ? this.view(provider) : null;
  }

  async saveProfile(auth: AuthContext, dto: SaveProviderProfileDto) {
    const userId = auth.user.id;
    const existing = await this.find(userId);
    // Ya verificado puede cambiar oficios, zona y horario; nombre y CURP ya no.
    const workOnly = existing?.status === 'VERIFIED';
    if (existing && !workOnly && !isEditableStatus(existing.status)) {
      throw new ConflictException(
        existing.status === 'PENDING_REVIEW'
          ? 'Tu registro está en revisión; espera la respuesta para cambiarlo'
          : 'Tu registro no se puede cambiar aquí',
      );
    }
    if (
      workOnly &&
      (dto.curp || dto.displayName.trim() !== existing.displayName)
    ) {
      throw new ConflictException(
        'Tu nombre y tu CURP ya no se cambian después de verificarte',
      );
    }

    if (dto.trades.some((trade) => PENDING_TRADES.includes(trade))) {
      throw new BadRequestException(
        'Ese oficio pide cédula o permiso que todavía no verificamos; muy pronto se podrá elegir',
      );
    }
    // Las profesiones con cédula solo llegan aquí si ya estaban aprobadas.
    if (
      dto.trades.some(
        (trade) =>
          TITLE_TRADES.includes(trade) && !existing?.trades.includes(trade),
      )
    ) {
      throw new BadRequestException(
        'Las profesiones con cédula (ingeniería, contaduría, leyes...) se agregan en «Mis cédulas» con la foto de tu título o cédula',
      );
    }
    // Los de salud nuevos necesitan su cédula verificada en Salud; si ya se aprobó su cédula en
    // Tequio, ya vienen en lo que ofrece.
    const clinical = dto.trades.filter(
      (trade) =>
        CLINICAL_TRADES.includes(trade) && !existing?.trades.includes(trade),
    );
    if (clinical.length) {
      const license = await this.prisma.clinicalProfessionalProfile.findUnique({
        where: { userId },
        select: { profession: true, verificationStatus: true, active: true },
      });
      if (!clinical.every((trade) => clinicalTradeAllowed(trade, license))) {
        throw new BadRequestException(
          'Para ofrecer servicios de salud manda tu cédula (número, foto y selfie con ella) en «Mis cédulas», o verifícala en Salud',
        );
      }
    }
    if (!findMunicipality(dto.municipalityCode)) {
      throw new BadRequestException('Elige tu municipio de la lista');
    }
    const availability = buildAvailability({
      days: dto.availableDays,
      allDay: dto.allDay,
      from: dto.fromTime,
      to: dto.toTime,
    });
    if (!availability.ok) {
      throw new BadRequestException(
        availability.reason === 'DAYS'
          ? 'Elige al menos un día'
          : 'Revisa tu horario: la hora de inicio y la de fin no pueden ser iguales',
      );
    }

    const data: Prisma.PresenteProviderUncheckedCreateInput = {
      userId,
      displayName: dto.displayName.trim(),
      // Las profesiones con cédula ya aprobadas se conservan aunque no vengan en la lista.
      trades: Array.from(
        new Set([
          ...dto.trades,
          ...(existing?.trades ?? []).filter((t) =>
            CREDENTIAL_TRADES.includes(t),
          ),
        ]),
      ),
      zoneLabel: dto.zoneLabel?.trim() || null,
      bio: dto.bio?.trim() || null,
      municipalityCode: dto.municipalityCode,
      radiusKm: dto.radiusKm ?? existing?.radiusKm ?? 5,
      availability: availability.value,
      isBusiness: dto.isBusiness ?? existing?.isBusiness ?? false,
      businessName:
        (dto.isBusiness ?? existing?.isBusiness)
          ? (dto.businessName ?? existing?.businessName ?? '').trim() || null
          : null,
      delivers: dto.delivers ?? existing?.delivers ?? false,
      teaches: dto.teaches ?? existing?.teaches ?? false,
      invoices: dto.invoices ?? existing?.invoices ?? false,
    };
    if (data.isBusiness && !data.businessName) {
      throw new BadRequestException('Escribe el nombre de tu negocio');
    }

    if (dto.curp) {
      const check = checkCurp(dto.curp);
      if (!check.ok) throw new BadRequestException(CURP_MESSAGES[check.reason]);
      if (!isAdultOn(check.birthDate)) {
        throw new BadRequestException(
          'Para ofrecer servicios en Tequio necesitas ser mayor de edad',
        );
      }
      const hash = curpFingerprint(check.curp);
      const owner = await this.prisma.presenteProvider.findUnique({
        where: { curpHash: hash },
        select: { userId: true },
      });
      if (owner && owner.userId !== userId) {
        throw new ConflictException(
          'Esa CURP ya está registrada en otra cuenta',
        );
      }
      data.curpHash = hash;
      data.curpEncrypted = encryptText(check.curp);
      data.curpLast4 = check.curp.slice(-4);
    }

    // ¿Quién lo recomendó? Solo al registrarse y una sola vez; no puede ser él mismo.
    const code = dto.referralCode?.trim();
    if (code && !workOnly && !existing?.referredByProviderId) {
      const prefix = parseWalletCode(code);
      const referrer = prefix
        ? await this.prisma.presenteProvider.findMany({
            where: { id: { startsWith: prefix }, status: 'VERIFIED' },
            select: { id: true, userId: true },
            take: 2,
          })
        : [];
      if (referrer.length !== 1 || referrer[0].userId === userId) {
        throw new BadRequestException(
          'Ese código de recomendación no es válido. Revísalo o déjalo vacío.',
        );
      }
      data.referredByProviderId = referrer[0].id;
    }

    let saved: ProviderWithDocs;
    try {
      const { userId: _ignored, ...update } = data;
      void _ignored;
      saved = await this.prisma.presenteProvider.upsert({
        where: { userId },
        create: data,
        update,
        include: providerInclude,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Esa CURP ya está registrada en otra cuenta',
        );
      }
      throw error;
    }

    // Historial: qué cambió (sin guardar la CURP ni datos sensibles).
    const changed: string[] = existing
      ? (
          [
            'displayName',
            'bio',
            'zoneLabel',
            'municipalityCode',
            'radiusKm',
            'isBusiness',
            'businessName',
            'delivers',
            'teaches',
            'invoices',
          ] as const
        ).filter((field) => existing[field] !== saved[field])
      : [];
    if (
      existing &&
      existing.trades.slice().sort().join() !==
        saved.trades.slice().sort().join()
    ) {
      changed.push('trades');
    }
    if (
      existing &&
      JSON.stringify(existing.availability) !==
        JSON.stringify(saved.availability)
    ) {
      changed.push('availability');
    }
    await this.audit(saved.id, userId, 'PROFILE_SAVED', {
      trades: saved.trades,
      changed,
      curpUpdated: Boolean(dto.curp),
    });
    return this.view(saved);
  }

  async setConsent(auth: AuthContext, accepted: boolean) {
    const provider = await this.requireEditable(auth.user.id);
    if (!accepted) {
      // Sin permiso no se conserva la selfie.
      const selfie = provider.documents.find((doc) => doc.kind === 'SELFIE');
      if (selfie) {
        await this.storage.delete(selfie.objectKey);
        await this.prisma.presenteDocument.delete({ where: { id: selfie.id } });
      }
    }
    const saved = await this.prisma.presenteProvider.update({
      where: { id: provider.id },
      data: accepted
        ? {
            biometricConsentAt: new Date(),
            consentVersion: PRESENTE_CONSENT_VERSION,
          }
        : { biometricConsentAt: null, consentVersion: null },
      include: providerInclude,
    });
    await this.audit(
      provider.id,
      auth.user.id,
      accepted ? 'CONSENT_GIVEN' : 'CONSENT_WITHDRAWN',
      {
        version: PRESENTE_CONSENT_VERSION,
      },
    );
    return this.view(saved);
  }

  async uploadDocument(auth: AuthContext, dto: UploadProviderDocumentDto) {
    const provider = await this.requireEditable(auth.user.id);
    if (dto.kind === 'SELFIE' && !provider.biometricConsentAt) {
      throw new ForbiddenException(
        'Primero acepta el uso de tu foto para verificarte',
      );
    }
    const image = parseImageDataUrl(dto.dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);

    const key = this.storage.newKey(provider.id, dto.kind);
    await this.storage.put(key, image.bytes);
    const previous = provider.documents.find((doc) => doc.kind === dto.kind);
    await this.prisma.presenteDocument.upsert({
      where: { providerId_kind: { providerId: provider.id, kind: dto.kind } },
      create: {
        providerId: provider.id,
        kind: dto.kind,
        objectKey: key,
        mimeType: image.mimeType,
        bytes: image.bytes.length,
      },
      update: {
        objectKey: key,
        mimeType: image.mimeType,
        bytes: image.bytes.length,
      },
    });
    if (previous) await this.storage.delete(previous.objectKey);

    await this.audit(provider.id, auth.user.id, 'DOCUMENT_UPLOADED', {
      kind: dto.kind,
    });
    const saved = await this.find(auth.user.id);
    return this.view(saved!);
  }

  async submit(auth: AuthContext) {
    const provider = await this.requireEditable(auth.user.id);
    const missing = missingForSubmit(
      provider,
      provider.documents.map((doc) => doc.kind),
    );
    if (missing.length) {
      throw new BadRequestException({
        message: 'Faltan datos o fotos para mandar tu registro',
        missing,
      });
    }
    const saved = await this.prisma.presenteProvider.update({
      where: { id: provider.id },
      data: {
        status: 'PENDING_REVIEW',
        submittedAt: new Date(),
        reviewNote: null,
      },
      include: providerInclude,
    });
    await this.audit(provider.id, auth.user.id, 'SUBMITTED');
    return this.view(saved);
  }

  async setPresence(auth: AuthContext, present: boolean) {
    const provider = await this.find(auth.user.id);
    if (!provider)
      throw new NotFoundException('Primero regístrate para trabajar');
    if (present && provider.status === 'WITHDRAWN') {
      throw new ForbiddenException(
        'Te diste de baja. Para volver, entra a Mis datos y toca «Volver a ofrecer mis servicios».',
      );
    }
    if (present && provider.status !== 'VERIFIED') {
      throw new ForbiddenException(
        'Podrás ponerte Presente cuando aprobemos tu registro',
      );
    }
    const recheck = identityRecheck(
      provider,
      provider.documents.some((doc) => doc.kind === RECHECK_DOCUMENT_KIND),
    );
    if (present && recheck?.state === 'OVERDUE') {
      throw new ForbiddenException(
        'Toca revalidar tu identidad: manda una selfie nueva en Cuenta › Verificación para seguir trabajando.',
      );
    }
    if (present && isSuspended(provider)) {
      throw new ForbiddenException(
        `Estás de baja temporal por cancelar varios trabajos. Vuelves el ${provider.suspendedUntil!.toLocaleDateString('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' })}.`,
      );
    }
    const now = new Date();
    const next = present ? 'PRESENT' : 'ABSENT';
    const saved = await this.prisma.presenteProvider.update({
      where: { id: provider.id },
      data: {
        presence: next,
        lastSeenAt: present ? now : provider.lastSeenAt,
        presenceChangedAt:
          provider.presence === next ? provider.presenceChangedAt : now,
      },
      include: providerInclude,
    });
    if (provider.presence !== next) {
      await this.audit(
        provider.id,
        auth.user.id,
        present ? 'PRESENT' : 'ABSENT',
      );
    }
    return this.view(saved, now);
  }

  /** No se puede dejar a un cliente esperando: primero termina o cancela lo que tiene. */
  private async requireNoActiveJobs(providerId: string) {
    const active = await this.prisma.presenteQuote.count({
      where: {
        providerId,
        status: 'ACCEPTED',
        request: { status: { in: ACTIVE_JOB } },
      },
    });
    if (active) {
      throw new ConflictException(
        'Tienes un trabajo en curso. Termínalo o cancélalo antes de darte de baja.',
      );
    }
  }

  /**
   * Darse de baja: deja de ofrecer servicios (no aparece en búsquedas ni recibe pedidos), pero
   * su registro, verificación, estrellas, fotos y saldo se guardan para cuando quiera volver.
   */
  async withdraw(auth: AuthContext) {
    const provider = await this.find(auth.user.id);
    if (!provider) throw new NotFoundException('No ofreces servicios');
    if (provider.status === 'WITHDRAWN') return this.view(provider);
    await this.requireNoActiveJobs(provider.id);
    const saved = await this.prisma.presenteProvider.update({
      where: { id: provider.id },
      data: {
        status: 'WITHDRAWN',
        statusBeforeWithdraw: provider.status,
        withdrawnAt: new Date(),
        presence: 'ABSENT',
        presenceChangedAt: new Date(),
      },
      include: providerInclude,
    });
    await this.audit(provider.id, auth.user.id, 'WITHDRAWN', {
      from: provider.status,
    });
    return this.view(saved);
  }

  /** Volver a ofrecer servicios: regresa como estaba, sin verificarse otra vez. */
  async comeBack(auth: AuthContext) {
    const provider = await this.find(auth.user.id);
    if (!provider) throw new NotFoundException('Primero regístrate');
    if (provider.status !== 'WITHDRAWN') return this.view(provider);
    const previous = provider.statusBeforeWithdraw || 'DRAFT';
    const saved = await this.prisma.presenteProvider.update({
      where: { id: provider.id },
      data: {
        status: previous,
        statusBeforeWithdraw: null,
        withdrawnAt: null,
      },
      include: providerInclude,
    });
    await this.audit(provider.id, auth.user.id, 'CAME_BACK', { to: previous });
    return this.view(saved);
  }

  /** Borrar para siempre: se borran fotos y datos de trabajo. La bitácora se conserva. */
  async deleteForever(auth: AuthContext) {
    const provider = await this.find(auth.user.id);
    if (!provider) return { deleted: false };
    await this.requireNoActiveJobs(provider.id);
    const photos = await this.prisma.presenteProviderPhoto.findMany({
      where: { providerId: provider.id },
    });
    for (const file of [...provider.documents, ...photos]) {
      await this.storage.delete(file.objectKey);
    }
    await this.prisma.presenteProvider.delete({ where: { id: provider.id } });
    await this.audit(provider.id, auth.user.id, 'DELETED');
    return { deleted: true };
  }

  /** Selfie nueva para comprobar que la cuenta la sigue usando la misma persona. */
  async sendRecheck(auth: AuthContext, dataUrl: string) {
    const provider = await this.find(auth.user.id);
    if (!provider || provider.status !== 'VERIFIED') {
      throw new ForbiddenException('Solo para quien ya está verificado');
    }
    if (!provider.biometricConsentAt) {
      throw new ConflictException('Primero da tu permiso para usar tu foto');
    }
    const image = parseImageDataUrl(dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
    const key = this.storage.newKey(provider.id, RECHECK_DOCUMENT_KIND);
    await this.storage.put(key, image.bytes);
    const previous = provider.documents.find(
      (doc) => doc.kind === RECHECK_DOCUMENT_KIND,
    );
    await this.prisma.presenteDocument.upsert({
      where: {
        providerId_kind: {
          providerId: provider.id,
          kind: RECHECK_DOCUMENT_KIND,
        },
      },
      create: {
        providerId: provider.id,
        kind: RECHECK_DOCUMENT_KIND,
        objectKey: key,
        mimeType: image.mimeType,
        bytes: image.bytes.length,
      },
      update: {
        objectKey: key,
        mimeType: image.mimeType,
        bytes: image.bytes.length,
      },
    });
    if (previous && previous.objectKey !== key) {
      await this.storage.delete(previous.objectKey);
    }
    await this.audit(provider.id, auth.user.id, 'RECHECK_SENT');
    return this.getMine(auth);
  }

  /** Mi historial: lo que he cambiado y lo que Yalika ha revisado, más reciente primero. */
  async history(auth: AuthContext) {
    const provider = await this.find(auth.user.id);
    if (!provider) return [];
    const events = await this.prisma.presenteAuditEvent.findMany({
      where: {
        providerId: provider.id,
        action: { in: Object.keys(HISTORY_LABELS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return events.map((event) => {
      const meta = (event.metadata ?? {}) as {
        changed?: string[];
        trade?: string;
        note?: string;
      };
      return {
        at: event.createdAt,
        action: event.action,
        label: HISTORY_LABELS[event.action] ?? event.action,
        changed: Array.isArray(meta.changed) ? meta.changed : [],
        trade: typeof meta.trade === 'string' ? meta.trade : null,
        note: typeof meta.note === 'string' ? meta.note : null,
        byYalika: event.actorUserId !== auth.user.id,
      };
    });
  }

  // ---------- Operador ----------

  async listPending() {
    const providers = await this.prisma.presenteProvider.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: providerInclude,
      orderBy: { submittedAt: 'asc' },
      take: 100,
    });
    return providers.map((provider) => {
      const curp = provider.curpEncrypted
        ? decryptText(provider.curpEncrypted)
        : null;
      const check = curp ? checkCurp(curp) : null;
      return {
        id: provider.id,
        userId: provider.userId,
        displayName: provider.displayName,
        bio: provider.bio,
        trades: provider.trades,
        zoneLabel: provider.zoneLabel,
        municipalityName:
          findMunicipality(provider.municipalityCode)?.name ?? null,
        availability: readAvailability(provider.availability),
        curp,
        age: check?.ok ? ageOn(check.birthDate) : null,
        documents: provider.documents.map((doc) => doc.kind),
        submittedAt: provider.submittedAt,
      };
    });
  }

  async readDocument(operatorUserId: string, providerId: string, kind: string) {
    const doc = await this.prisma.presenteDocument.findUnique({
      where: { providerId_kind: { providerId, kind } },
    });
    if (!doc) throw new NotFoundException('Esa foto ya no existe');
    const bytes = await this.storage.get(doc.objectKey);
    await this.audit(providerId, operatorUserId, 'DOCUMENT_VIEWED', { kind });
    return {
      kind,
      dataUrl: `data:${doc.mimeType};base64,${bytes.toString('base64')}`,
    };
  }

  /** Aprobar o rechazar. En los dos casos las fotos se borran: solo queda el resultado. */
  async decide(
    operatorUserId: string,
    providerId: string,
    dto: ReviewDecisionDto,
  ) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: providerId },
      include: providerInclude,
    });
    if (!provider) throw new NotFoundException('Registro no encontrado');
    if (provider.status !== 'PENDING_REVIEW') {
      throw new ConflictException('Este registro no está esperando revisión');
    }
    if (!dto.approve && !dto.note?.trim()) {
      throw new BadRequestException(
        'Escribe el motivo para que la persona sepa qué corregir',
      );
    }

    // El INE se borra siempre. Al aprobar, la selfie se queda cifrada como referencia para
    // revalidar la identidad más adelante (con su permiso); al rechazar también se borra.
    const remove = provider.documents.filter(
      (doc) => !(dto.approve && doc.kind === 'SELFIE'),
    );
    for (const doc of remove) await this.storage.delete(doc.objectKey);
    const now = new Date();
    const [, saved] = await this.prisma.$transaction([
      this.prisma.presenteDocument.deleteMany({
        where: { id: { in: remove.map((doc) => doc.id) } },
      }),
      this.prisma.presenteProvider.update({
        where: { id: providerId },
        data: {
          status: dto.approve ? 'VERIFIED' : 'REJECTED',
          reviewedAt: now,
          reviewedByUserId: operatorUserId,
          reviewNote: dto.note?.trim() || null,
          identityCheckedAt: dto.approve ? now : provider.identityCheckedAt,
        },
      }),
    ]);
    await this.audit(
      providerId,
      operatorUserId,
      dto.approve ? 'APPROVED' : 'REJECTED',
      {
        note: dto.note?.trim() || undefined,
      },
    );
    // Al aprobar: regalo de bienvenida (una vez por CURP) y, si ya recargó, premio a quien lo
    // recomendó.
    if (dto.approve) {
      await this.wallet.ensureWelcome(saved, operatorUserId);
      await this.wallet.rewardReferrer(saved.id, operatorUserId);
    }
    return { id: saved.id, status: saved.status };
  }

  /** Selfies para revalidar identidad que esperan revisión. */
  async listRechecks() {
    const docs = await this.prisma.presenteDocument.findMany({
      where: { kind: RECHECK_DOCUMENT_KIND },
      include: { provider: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return docs.map((doc) => ({
      providerId: doc.providerId,
      displayName: doc.provider.displayName,
      trades: doc.provider.trades,
      sentAt: doc.createdAt,
      lastCheckedAt: doc.provider.identityCheckedAt ?? doc.provider.reviewedAt,
    }));
  }

  /** Confirmar (o no) que la selfie nueva es la misma persona que la guardada. */
  async decideRecheck(
    operatorUserId: string,
    providerId: string,
    dto: ReviewDecisionDto,
  ) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: providerId },
      include: providerInclude,
    });
    const fresh = provider?.documents.find(
      (doc) => doc.kind === RECHECK_DOCUMENT_KIND,
    );
    if (!provider || !fresh) {
      throw new NotFoundException('No hay selfie esperando revisión');
    }
    if (!dto.approve && !dto.note?.trim()) {
      throw new BadRequestException(
        'Escribe el motivo para que sepa qué repetir',
      );
    }
    const reference = provider.documents.find((doc) => doc.kind === 'SELFIE');
    if (dto.approve) {
      // La selfie nueva pasa a ser la referencia (la cara cambia con los años).
      if (reference) await this.storage.delete(reference.objectKey);
      await this.prisma.$transaction([
        ...(reference
          ? [
              this.prisma.presenteDocument.delete({
                where: { id: reference.id },
              }),
            ]
          : []),
        this.prisma.presenteDocument.update({
          where: { id: fresh.id },
          data: { kind: 'SELFIE' },
        }),
        this.prisma.presenteProvider.update({
          where: { id: providerId },
          data: { identityCheckedAt: new Date() },
        }),
      ]);
    } else {
      await this.storage.delete(fresh.objectKey);
      await this.prisma.presenteDocument.delete({ where: { id: fresh.id } });
    }
    await this.audit(
      providerId,
      operatorUserId,
      dto.approve ? 'RECHECK_APPROVED' : 'RECHECK_REJECTED',
      { note: dto.note?.trim() || undefined },
    );
    return { id: providerId, approved: dto.approve };
  }

  /** Suspender a alguien ya verificado (por ejemplo, por un reporte). Queda Ausente. */
  async suspend(operatorUserId: string, providerId: string, note: string) {
    if (!note?.trim())
      throw new BadRequestException('Escribe el motivo de la suspensión');
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw new NotFoundException('Registro no encontrado');
    const saved = await this.prisma.presenteProvider.update({
      where: { id: providerId },
      data: {
        status: 'SUSPENDED',
        presence: 'ABSENT',
        reviewNote: note.trim(),
      },
    });
    await this.audit(providerId, operatorUserId, 'SUSPENDED', {
      note: note.trim(),
    });
    return { id: saved.id, status: saved.status };
  }
}
