import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthContext } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  FinishJobDto,
  ProviderPhotoDto,
  ReviewDto,
  SaveClientProfileDto,
} from './dto/presente.dto';
import { findMunicipality } from './geo/municipios';
import {
  ACTIVE_JOB,
  arrivalPin,
  canMove,
  careLink,
  containsPhone,
  distanceMeters,
  suspensionAfterStrikes,
} from './presente-job.domain';
import {
  PresenteRequestsService,
  requestPhotos,
} from './presente-requests.service';
import { PresenteDebtsService } from './presente-debts.service';
import { INVOICE_DAYS, ivaFor, reviewGate } from './presente-invoice.domain';
import { PresentePushService } from './presente-push.service';
import { userRecordOpen } from './presente-safety.domain';
import { PresenteRemindersService } from './presente-reminders.service';
import { PresenteStorageService } from './presente-storage.service';
import { PresenteWalletService } from './presente-wallet.service';
import {
  ARRIVAL_MAX_METERS,
  MAX_DELAY_NOTICES,
  MAX_PROVIDER_PHOTOS,
  PIN_LOCK_MINUTES,
  PIN_MAX_FAILURES,
  REQUEST_TTL_HOURS,
  CLINICAL_TRADES,
  CONFIRM_HOURS,
  SEP_LICENSE_LOOKUP_URL,
  STRIKE_WINDOW_DAYS,
} from './presente.constants';
import {
  clinicalTradeAllowed,
  parseImageDataUrl,
  readAvailability,
} from './presente.domain';

const TWELVE_HOURS = 12 * 3_600_000;
const ONE_HOUR = 3_600_000;
const MIN_TRACK_GAP_MS = 15_000;

const IMAGE_MESSAGES: Record<string, string> = {
  FORMAT: 'La foto debe ser JPG, PNG o WEBP.',
  TOO_SMALL: 'La foto salió muy pequeña o borrosa. Tómala de nuevo.',
  TOO_LARGE: 'La foto es muy pesada. Tómala de nuevo.',
};

// "8:55 p.m." (ya trae su punto final; no se le agrega otro).
const clock = (date: Date) =>
  date.toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });

type JobContext = Awaited<ReturnType<PresenteJobsService['loadJob']>>;

/**
 * Lo que pasa después de elegir: datos del cliente, en camino, recorrido, llegada con PIN,
 * trabajo, fin, cancelaciones, mensajes, estrellas y fotos del trabajador.
 */
@Injectable()
export class PresenteJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenteJobsService.name);
  private cleanupTimer?: NodeJS.Timeout;
  private confirmTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PresenteStorageService,
    private readonly requests: PresenteRequestsService,
    private readonly wallet: PresenteWalletService,
    private readonly reminders: PresenteRemindersService,
    private readonly debts: PresenteDebtsService,
    private readonly push: PresentePushService,
  ) {}

  // ---------- Tareas de cada 12 horas (la sábana de seguridad se limpia en su servicio) ----------

  onModuleInit() {
    const housekeeping = () => {
      // Recordarle a quien debe una cancelación, cada pocos días.
      void this.debts.remindDue();
      void this.push.cleanup();
    };
    housekeeping();
    this.cleanupTimer = setInterval(housekeeping, TWELVE_HOURS);
    this.cleanupTimer.unref?.();
    void this.autoConfirm();
    this.confirmTimer = setInterval(() => void this.autoConfirm(), ONE_HOUR);
    this.confirmTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.confirmTimer) clearInterval(this.confirmTimer);
  }

  // ---------- Cierre: el cliente confirma, o a las 48 h se da por terminado ----------

  /** Cierra un trabajo terminado y descuenta la comisión sobre el precio final. */
  private async close(
    request: JobContext['request'],
    chosen: NonNullable<JobContext['chosen']>,
    actorUserId: string,
    how: 'CLIENT' | 'AUTO' | 'OPERATOR',
    charge = true,
  ) {
    const now = new Date();
    const updated = await this.prisma.presenteRequest.updateMany({
      where: { id: request.id, status: 'COMPLETED', clientConfirmedAt: null },
      data: { clientConfirmedAt: now, autoConfirmed: how === 'AUTO' },
    });
    if (!updated.count) return false;
    if (charge) {
      await this.wallet.chargeCommission(
        chosen.providerId,
        request.id,
        request.finalAmountMxn ?? chosen.amountMxn,
      );
      // El adeudo anterior que cobró en efectivo pasa al trabajador a quien se le debía.
      await this.debts.settleWithJob(request.id, chosen.providerId);
    } else {
      await this.debts.release(request.id);
    }
    await this.system(
      request.id,
      actorUserId,
      how === 'CLIENT'
        ? 'El cliente confirmó que el trabajo quedó bien. ¡Gracias por usar Presente!'
        : how === 'AUTO'
          ? `Pasaron ${CONFIRM_HOURS} horas sin respuesta del cliente: el trabajo se dio por terminado.`
          : 'Yalika revisó el reporte y cerró el trabajo.',
    );
    await this.audit(
      actorUserId,
      'JOB_CONFIRMED',
      { requestId: request.id, how, charge },
      chosen.providerId,
    );
    return true;
  }

  /** Trabajos terminados hace más de 48 h, sin respuesta ni reporte del cliente. */
  async autoConfirm(now = new Date()) {
    try {
      const due = await this.prisma.presenteRequest.findMany({
        where: {
          status: 'COMPLETED',
          clientConfirmedAt: null,
          problemAt: null,
          finishedAt: {
            lte: new Date(now.getTime() - CONFIRM_HOURS * ONE_HOUR),
          },
        },
        select: { id: true },
        take: 200,
      });
      for (const { id } of due) {
        const { request, chosen } = await this.loadJob(id);
        if (chosen)
          await this.close(request, chosen, request.clientUserId, 'AUTO');
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron cerrar trabajos pendientes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async requireOwnFinished(auth: AuthContext, requestId: string) {
    const { request, chosen } = await this.loadJob(requestId);
    if (request.clientUserId !== auth.user.id || !chosen) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (request.status !== 'COMPLETED' || request.clientConfirmedAt) {
      throw new ConflictException(
        'Este trabajo no está esperando tu confirmación',
      );
    }
    return { request, chosen };
  }

  /** El cliente confirma que quedó bien: se cierra y se descuenta la comisión. */
  async confirmDone(auth: AuthContext, requestId: string) {
    const { request, chosen } = await this.requireOwnFinished(auth, requestId);
    await this.close(request, chosen, auth.user.id, 'CLIENT');
    return this.requests.getMine(auth, requestId);
  }

  /** El cliente dice que algo quedó mal: no se cierra solo; lo revisa el operador. */
  async reportProblem(auth: AuthContext, requestId: string, note: string) {
    const { request, chosen } = await this.requireOwnFinished(auth, requestId);
    if (request.problemAt) {
      throw new ConflictException(
        'Ya reportaste este trabajo; lo estamos revisando',
      );
    }
    await this.prisma.presenteRequest.update({
      where: { id: requestId },
      data: { problemAt: new Date(), problemNote: note.trim() },
    });
    await this.system(
      requestId,
      auth.user.id,
      'El cliente reportó un problema con el trabajo. Yalika lo va a revisar con los dos.',
    );
    await this.audit(
      auth.user.id,
      'JOB_PROBLEM',
      { requestId, note: note.trim() },
      chosen.providerId,
    );
    return this.requests.getMine(auth, requestId);
  }

  /** Operador: trabajos con reporte del cliente, sin cerrar. */
  async listProblems() {
    const rows = await this.prisma.presenteRequest.findMany({
      where: {
        status: 'COMPLETED',
        clientConfirmedAt: null,
        problemAt: { not: null },
      },
      include: { quotes: { include: { provider: true } } },
      orderBy: { problemAt: 'asc' },
      take: 100,
    });
    const clients = await this.prisma.presenteClient.findMany({
      where: { userId: { in: rows.map((r) => r.clientUserId) } },
      select: { userId: true, displayName: true },
    });
    return rows.map((r) => {
      const chosen = r.quotes.find((q) => q.id === r.chosenQuoteId);
      return {
        requestId: r.id,
        trades: r.trades,
        description: r.description,
        clientName:
          clients.find((c) => c.userId === r.clientUserId)?.displayName ??
          'Cliente',
        providerName: chosen?.provider.displayName ?? '—',
        amountMxn: r.finalAmountMxn ?? chosen?.amountMxn ?? null,
        problemNote: r.problemNote,
        problemAt: r.problemAt,
        finishedAt: r.finishedAt,
      };
    });
  }

  /** Operador: cierra un trabajo reportado, con o sin comisión. */
  async closeProblem(
    operatorUserId: string,
    requestId: string,
    charge: boolean,
    note: string,
  ) {
    const { request, chosen } = await this.loadJob(requestId);
    if (!chosen || !request.problemAt || request.status !== 'COMPLETED') {
      throw new ConflictException('Ese trabajo no tiene un reporte abierto');
    }
    const closed = await this.close(
      request,
      chosen,
      operatorUserId,
      'OPERATOR',
      charge,
    );
    if (!closed) throw new ConflictException('Ese trabajo ya estaba cerrado');
    await this.audit(
      operatorUserId,
      'JOB_PROBLEM_CLOSED',
      { requestId, charge, note: note.trim() },
      chosen.providerId,
    );
    return this.listProblems();
  }

  private async audit(
    actorUserId: string,
    action: string,
    metadata: Record<string, unknown>,
    providerId: string | null = null,
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

  private system(requestId: string, actorUserId: string, body: string) {
    return this.prisma.presenteMessage.create({
      data: {
        requestId,
        senderUserId: actorUserId,
        senderRole: 'SYSTEM',
        body,
      },
    });
  }

  /** El pedido con su presupuesto elegido y el trabajador. */
  async loadJob(requestId: string) {
    const request = await this.prisma.presenteRequest.findUnique({
      where: { id: requestId },
      include: { quotes: { include: { provider: true } }, reviews: true },
    });
    if (!request) throw new NotFoundException('Pedido no encontrado');
    const chosen =
      request.quotes.find((q) => q.id === request.chosenQuoteId) ?? null;
    return { request, chosen };
  }

  /** Solo el trabajador elegido. A cualquier otro se le responde "no encontrado". */
  private async requireMyJob(auth: AuthContext, requestId: string) {
    const job = await this.loadJob(requestId);
    if (!job.chosen || job.chosen.provider.userId !== auth.user.id) {
      throw new NotFoundException('Trabajo no encontrado');
    }
    return job as JobContext & { chosen: NonNullable<JobContext['chosen']> };
  }

  /** Cliente dueño o trabajador elegido. */
  async requireParticipant(auth: AuthContext, requestId: string) {
    const job = await this.loadJob(requestId);
    const isClient = job.request.clientUserId === auth.user.id;
    const isWorker = Boolean(
      job.chosen && job.chosen.provider.userId === auth.user.id,
    );
    if (!isClient && !isWorker)
      throw new NotFoundException('Pedido no encontrado');
    return {
      ...job,
      role: isClient ? ('CLIENT' as const) : ('WORKER' as const),
    };
  }

  private requireStatus(current: string, next: string) {
    if (!canMove(current, next)) {
      throw new ConflictException(
        'Ese paso no corresponde a la etapa del trabajo',
      );
    }
  }

  // ---------- Datos de quien pide ayuda ----------

  async getClient(auth: AuthContext) {
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId: auth.user.id },
    });
    if (!client) return null;
    const rating = (await this.requests.ratings([auth.user.id])).get(
      auth.user.id,
    );
    return {
      displayName: client.displayName,
      homeLat: client.homeLat,
      homeLng: client.homeLng,
      homeReference: client.homeReference,
      hasHousePhoto: Boolean(client.housePhotoKey),
      rating: rating ?? { average: null, count: 0 },
    };
  }

  async saveClient(auth: AuthContext, dto: SaveClientProfileDto) {
    const data = {
      displayName: dto.displayName.trim(),
      homeLat: dto.homeLat ?? null,
      homeLng: dto.homeLng ?? null,
      homeReference: dto.homeReference?.trim() || null,
    };
    await this.prisma.presenteClient.upsert({
      where: { userId: auth.user.id },
      create: { userId: auth.user.id, ...data },
      update: data,
    });
    return this.getClient(auth);
  }

  async setHousePhoto(auth: AuthContext, dataUrl: string) {
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId: auth.user.id },
    });
    if (!client) throw new ConflictException('Primero guarda tus datos');
    const image = parseImageDataUrl(dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
    const key = `private/presente/clients/${client.id}/house-${randomUUID()}.bin`;
    await this.storage.put(key, image.bytes);
    await this.prisma.presenteClient.update({
      where: { id: client.id },
      data: { housePhotoKey: key, housePhotoMime: image.mimeType },
    });
    if (client.housePhotoKey) await this.storage.delete(client.housePhotoKey);
    return this.getClient(auth);
  }

  /** Foto de la casa: el dueño, o el trabajador elegido mientras el trabajo está activo. */
  async housePhoto(auth: AuthContext, requestId: string) {
    const { request, role } = await this.requireParticipant(auth, requestId);
    if (role === 'WORKER' && !ACTIVE_JOB.includes(request.status)) {
      throw new NotFoundException('La foto ya no está disponible');
    }
    // La foto del lugar elegido (Casa de mamá, Oficina...) o la de su casa de antes.
    const holder = request.placeId
      ? await this.prisma.presentePlace.findUnique({
          where: { id: request.placeId },
          select: { photoKey: true, photoMime: true },
        })
      : await this.prisma.presenteClient
          .findUnique({ where: { userId: request.clientUserId } })
          .then((c) =>
            c
              ? { photoKey: c.housePhotoKey, photoMime: c.housePhotoMime }
              : null,
          );
    if (!holder?.photoKey || !holder.photoMime) {
      throw new NotFoundException('No hay foto del lugar');
    }
    const bytes = await this.storage.get(holder.photoKey);
    return {
      dataUrl: `data:${holder.photoMime};base64,${bytes.toString('base64')}`,
    };
  }

  // ---------- Trabajador: el trabajo en curso ----------

  /** Trabajos donde me eligieron (activos y terminados recientes), con lo que necesito para llegar. */
  async myJobs(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
    });
    if (!provider) throw new ForbiddenException('Solo trabajadores');
    const quotes = await this.prisma.presenteQuote.findMany({
      where: { providerId: provider.id, status: 'ACCEPTED' },
      include: { request: { include: { reviews: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    const clientIds = quotes.map((q) => q.request.clientUserId);
    const placeIds = quotes
      .map((q) => q.request.placeId)
      .filter((id): id is string => Boolean(id));
    const [clients, ratings, places] = await Promise.all([
      this.prisma.presenteClient.findMany({
        where: { userId: { in: clientIds } },
      }),
      this.requests.ratings(clientIds),
      placeIds.length
        ? this.prisma.presentePlace.findMany({
            where: { id: { in: placeIds } },
            select: { id: true, photoKey: true },
          })
        : Promise.resolve([] as { id: string; photoKey: string | null }[]),
    ]);
    // Adeudos de cancelaciones anteriores que el cliente paga junto con este trabajo.
    const debts = await this.prisma.presenteCancelDebt.findMany({
      where: {
        appliedRequestId: { in: quotes.map((q) => q.request.id) },
        settledAt: null,
      },
      select: { appliedRequestId: true, amountMxn: true },
    });
    const debtFor = (requestId: string) =>
      debts
        .filter((d) => d.appliedRequestId === requestId)
        .reduce((sum, d) => sum + d.amountMxn, 0);
    return quotes.map(({ request, ...quote }) => {
      const client = clients.find((c) => c.userId === request.clientUserId);
      const active = ACTIVE_JOB.includes(request.status);
      const place = places.find((p) => p.id === request.placeId);
      return {
        requestId: request.id,
        status: request.status,
        trades: request.trades,
        careLink: careLink(request.trades),
        scheduledFor: request.scheduledFor,
        description: request.description,
        municipalityName:
          findMunicipality(request.municipalityCode)?.name ?? null,
        // El punto exacto y la referencia solo mientras el trabajo está activo.
        addressHint: active ? request.addressHint : null,
        lat: active ? request.lat : null,
        lng: active ? request.lng : null,
        clientName: client?.displayName ?? 'Cliente',
        clientRating: ratings.get(request.clientUserId) ?? {
          average: null,
          count: 0,
        },
        placeLabel: request.placeLabel,
        hasHousePhoto:
          active &&
          Boolean(request.placeId ? place?.photoKey : client?.housePhotoKey),
        hasPhoto: Boolean(request.photoKey),
        photoCount: requestPhotos(request).length,
        amountMxn: quote.amountMxn,
        etaMinutes: quote.etaMinutes,
        durationMinutes: quote.durationMinutes,
        finalAmountMxn: request.finalAmountMxn,
        collectDebtMxn: debtFor(request.id),
        needsInvoice: request.needsInvoice,
        cancelFeeMxn: request.cancelFeeMxn,
        clientConfirmedAt: request.clientConfirmedAt,
        problemAt: request.problemAt,
        etaAt: request.etaAt,
        delayCount: request.delayCount,
        enRouteAt: request.enRouteAt,
        arrivedAt: request.arrivedAt,
        startedAt: request.startedAt,
        estimatedMinutes: request.estimatedMinutes,
        finishedAt: request.finishedAt,
        cancelledBy: request.cancelledBy,
        reviewed: request.reviews.some((r) => r.fromUserId === auth.user.id),
        chosenAt: quote.updatedAt,
      };
    });
  }

  async enRoute(
    auth: AuthContext,
    requestId: string,
    etaMinutes: number,
    note?: string,
  ) {
    const { request, chosen } = await this.requireMyJob(auth, requestId);
    this.requireStatus(request.status, 'EN_ROUTE');
    const now = new Date();
    const etaAt = new Date(now.getTime() + etaMinutes * 60_000);
    const delayed = request.status === 'EN_ROUTE';
    if (delayed && request.delayCount >= MAX_DELAY_NOTICES) {
      throw new ConflictException(
        `Ya avisaste ${MAX_DELAY_NOTICES} veces que te retrasas. Escríbele al cliente; si no llegas, puede cancelar sin pagar tu traslado.`,
      );
    }
    await this.prisma.presenteRequest.update({
      where: { id: requestId },
      data: {
        status: 'EN_ROUTE',
        enRouteAt: request.enRouteAt ?? now,
        etaAt,
        delayNote: delayed ? note?.trim() || 'Se retrasó' : null,
        ...(delayed ? { delayCount: { increment: 1 } } : {}),
      },
    });
    await this.system(
      requestId,
      auth.user.id,
      delayed
        ? `${chosen.provider.displayName} se retrasa${note?.trim() ? `: ${note.trim()}` : ''}. Nueva llegada aprox. a las ${clock(etaAt)}`
        : `${chosen.provider.displayName} va en camino. Llega aprox. a las ${clock(etaAt)}`,
    );
    void this.push.notify([request.clientUserId], {
      title: delayed
        ? `${chosen.provider.displayName} se retrasa`
        : `${chosen.provider.displayName} va en camino`,
      body: `Llega aprox. a las ${clock(etaAt)}. Ten a la mano tu PIN.`,
      url: `/tequio/pedido/${requestId}`,
      tag: `camino-${requestId}`,
    });
    await this.audit(
      auth.user.id,
      delayed ? 'JOB_DELAYED' : 'JOB_EN_ROUTE',
      { requestId, etaMinutes },
      chosen.providerId,
    );
    return this.myJobs(auth);
  }

  /** Punto del recorrido. Se guarda uno cada 15 s como máximo. */
  async location(
    auth: AuthContext,
    requestId: string,
    lat: number,
    lng: number,
  ) {
    const { request } = await this.requireMyJob(auth, requestId);
    if (request.status !== 'EN_ROUTE') {
      throw new ConflictException(
        'Solo se comparte la ubicación mientras vas en camino',
      );
    }
    const last = await this.prisma.presenteTrackPoint.findFirst({
      where: { requestId },
      orderBy: { recordedAt: 'desc' },
    });
    if (last && Date.now() - last.recordedAt.getTime() < MIN_TRACK_GAP_MS) {
      return { saved: false };
    }
    await this.prisma.presenteTrackPoint.create({
      data: { requestId, lat, lng },
    });
    return { saved: true };
  }

  async arrive(
    auth: AuthContext,
    requestId: string,
    pin: string,
    position?: { lat?: number; lng?: number },
  ) {
    const { request, chosen } = await this.requireMyJob(auth, requestId);
    if (!['ASSIGNED', 'EN_ROUTE'].includes(request.status)) {
      throw new ConflictException(
        'Ese paso no corresponde a la etapa del trabajo',
      );
    }
    const now = new Date();
    if (request.pinLockedUntil && request.pinLockedUntil > now) {
      throw new HttpException(
        'Demasiados intentos de PIN. Espera unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let meters: number | null = null;
    if (
      position?.lat !== undefined &&
      position.lng !== undefined &&
      request.lat !== null &&
      request.lng !== null
    ) {
      meters = distanceMeters(
        { lat: position.lat, lng: position.lng },
        { lat: request.lat, lng: request.lng },
      );
      if (meters > ARRIVAL_MAX_METERS) {
        throw new ConflictException(
          `Parece que aún no llegas: estás a unos ${meters} m del punto.`,
        );
      }
    }

    if (pin !== arrivalPin(requestId)) {
      const failures = request.pinFailures + 1;
      const lock = failures >= PIN_MAX_FAILURES;
      await this.prisma.presenteRequest.update({
        where: { id: requestId },
        data: {
          pinFailures: lock ? 0 : failures,
          pinLockedUntil: lock
            ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000)
            : null,
        },
      });
      throw new BadRequestException(
        lock
          ? 'PIN incorrecto. Por seguridad, espera 10 minutos para volver a intentar.'
          : `PIN incorrecto. Te quedan ${PIN_MAX_FAILURES - failures} intentos.`,
      );
    }

    await this.prisma.presenteRequest.update({
      where: { id: requestId },
      data: {
        status: 'ARRIVED',
        arrivedAt: now,
        arrivalDistanceM: meters,
        pinFailures: 0,
        pinLockedUntil: null,
      },
    });
    await this.system(
      requestId,
      auth.user.id,
      `${chosen.provider.displayName} llegó y confirmó el PIN.`,
    );
    await this.audit(
      auth.user.id,
      'JOB_ARRIVED',
      { requestId, meters },
      chosen.providerId,
    );
    return this.myJobs(auth);
  }

  async start(auth: AuthContext, requestId: string, estimatedMinutes: number) {
    const { request, chosen } = await this.requireMyJob(auth, requestId);
    this.requireStatus(request.status, 'IN_PROGRESS');
    const now = new Date();
    await this.prisma.presenteRequest.update({
      where: { id: requestId },
      data: { status: 'IN_PROGRESS', startedAt: now, estimatedMinutes },
    });
    const end = new Date(now.getTime() + estimatedMinutes * 60_000);
    await this.system(
      requestId,
      auth.user.id,
      `Empezó el trabajo. Termina aprox. a las ${clock(end)}`,
    );
    await this.audit(
      auth.user.id,
      'JOB_STARTED',
      { requestId, estimatedMinutes },
      chosen.providerId,
    );
    return this.myJobs(auth);
  }

  /**
   * El trabajador marca "Terminé" con el precio real (si cambió). El cliente confirma que quedó
   * bien; si no contesta en 48 h se da por terminado. La comisión se descuenta al cerrar.
   */
  async finish(auth: AuthContext, requestId: string, dto: FinishJobDto = {}) {
    const { request, chosen } = await this.requireMyJob(auth, requestId);
    this.requireStatus(request.status, 'COMPLETED');
    const finalAmount = dto.finalAmountMxn ?? chosen.amountMxn;
    await this.prisma.presenteRequest.update({
      where: { id: requestId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        finalAmountMxn: finalAmount,
      },
    });
    await this.reminders.closeVisit(requestId, 'completed');
    // Pidió factura: el asistente se la recuerda al profesional hasta que la mande.
    if (request.needsInvoice) {
      const client = await this.prisma.presenteClient.findUnique({
        where: { userId: request.clientUserId },
        select: { displayName: true },
      });
      await this.reminders.remindInvoice({
        requestId,
        workerUserId: auth.user.id,
        clientName: client?.displayName ?? 'tu cliente',
        dueAt: new Date(Date.now() + INVOICE_DAYS * 86_400_000),
      });
    }
    const changed = finalAmount !== chosen.amountMxn;
    const debtMxn = await this.debts.totalFor(requestId);
    await this.system(
      requestId,
      auth.user.id,
      `Trabajo terminado. Precio final: $${finalAmount.toLocaleString('es-MX')}` +
        (request.needsInvoice
          ? ` + IVA $${ivaFor(finalAmount).toLocaleString('es-MX')} = $${(finalAmount + ivaFor(finalAmount)).toLocaleString('es-MX')}`
          : '') +
        (changed
          ? ` (el presupuesto era $${chosen.amountMxn.toLocaleString('es-MX')}).`
          : '.') +
        (debtMxn
          ? ` Más $${debtMxn} de una cancelación anterior: en total $${(finalAmount + debtMxn).toLocaleString('es-MX')}.`
          : '') +
        ` Cliente: confirma que quedó bien o reporta si algo falló; si no contestas en ${CONFIRM_HOURS} horas, se da por terminado.`,
    );
    void this.push.notify([request.clientUserId], {
      title: 'Trabajo terminado',
      body: `${chosen.provider.displayName} terminó. Confirma que quedó bien o avisa si algo falló.`,
      url: `/tequio/pedido/${requestId}`,
      tag: `terminado-${requestId}`,
    });
    await this.audit(
      auth.user.id,
      'JOB_FINISHED',
      { requestId, finalAmount },
      chosen.providerId,
    );
    return this.myJobs(auth);
  }

  /**
   * El trabajador cancela un trabajo donde ya lo eligieron: cuenta como falta y el pedido
   * vuelve a abrirse para que el cliente elija a otro.
   */
  async workerCancel(auth: AuthContext, requestId: string, reason?: string) {
    const { request, chosen } = await this.requireMyJob(auth, requestId);
    if (!['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(request.status)) {
      throw new ConflictException('Este trabajo ya no se puede cancelar');
    }
    const now = new Date();
    await this.reminders.closeVisit(requestId, 'cancelled');
    // Si traía un adeudo anterior, queda para cuando elija a otro.
    await this.debts.release(requestId);
    const ttl = REQUEST_TTL_HOURS[request.urgency] ?? 6;
    const expiresAt = new Date(
      Math.max(request.expiresAt.getTime(), now.getTime() + ttl * 3_600_000),
    );
    await this.prisma.$transaction([
      this.prisma.presenteRequest.update({
        where: { id: requestId },
        data: {
          status: 'OPEN',
          chosenQuoteId: null,
          closedAt: null,
          expiresAt,
          enRouteAt: null,
          etaAt: null,
          delayNote: null,
          arrivedAt: null,
          pinFailures: 0,
          pinLockedUntil: null,
        },
      }),
      this.prisma.presenteQuote.update({
        where: { id: chosen.id },
        data: { status: 'WITHDRAWN' },
      }),
      this.prisma.presenteQuote.updateMany({
        where: { requestId, status: 'DECLINED' },
        data: { status: 'SENT' },
      }),
      this.prisma.presenteStrike.create({
        data: {
          providerId: chosen.providerId,
          requestId,
          reason: reason?.trim() || null,
        },
      }),
    ]);
    await this.system(
      requestId,
      auth.user.id,
      `${chosen.provider.displayName} canceló. Tu pedido volvió a abrirse: puedes elegir otro presupuesto.`,
    );
    void this.push.notify([request.clientUserId], {
      title: `${chosen.provider.displayName} canceló`,
      body: 'Tu pedido volvió a abrirse: elige otro presupuesto.',
      url: `/tequio/pedido/${requestId}`,
      tag: `cancelado-${requestId}`,
    });

    const since = new Date(now.getTime() - STRIKE_WINDOW_DAYS * 86_400_000);
    const strikes = await this.prisma.presenteStrike.count({
      where: { providerId: chosen.providerId, createdAt: { gte: since } },
    });
    const until = suspensionAfterStrikes(strikes, now);
    if (until) {
      await this.prisma.presenteProvider.update({
        where: { id: chosen.providerId },
        data: { suspendedUntil: until, presence: 'ABSENT' },
      });
    }
    await this.audit(
      auth.user.id,
      'JOB_CANCELLED_BY_WORKER',
      { requestId, strikes, suspendedUntil: until?.toISOString() },
      chosen.providerId,
    );
    return { strikes, suspendedUntil: until };
  }

  // ---------- Cliente: cancelar ----------

  async clientCancel(auth: AuthContext, requestId: string, reason?: string) {
    const { request, chosen } = await this.loadJob(requestId);
    if (request.clientUserId !== auth.user.id) {
      throw new NotFoundException('Pedido no encontrado');
    }
    const now = new Date();
    const cancellable =
      (request.status === 'OPEN' && request.expiresAt > now) ||
      ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(request.status);
    if (!cancellable)
      throw new ConflictException('Este pedido ya no se puede cancelar');

    const fee = chosen
      ? await this.requests.cancelFeeFor(request, chosen.amountMxn, now)
      : null;
    const feeMxn = fee?.amountMxn ?? 0;
    await this.reminders.closeVisit(requestId, 'cancelled');
    await this.debts.release(requestId);
    await this.prisma.presenteRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        closedAt: request.closedAt ?? now,
        cancelledBy: 'CLIENT',
        cancelReason: reason?.trim() || null,
        cancelFeeMxn: feeMxn || null,
      },
    });
    if (chosen && fee && feeMxn) {
      await this.debts.record({
        clientUserId: request.clientUserId,
        requestId,
        providerId: chosen.providerId,
        workerName: chosen.provider.businessName || chosen.provider.displayName,
        amountMxn: feeMxn,
        advancedKm: fee.advancedKm,
      });
    }
    if (chosen) {
      await this.system(
        requestId,
        auth.user.id,
        feeMxn
          ? `El cliente canceló con ${chosen.provider.displayName} ${fee?.why === 'ARRIVED' ? 'ya en la puerta' : 'en camino'}. Cuota de traslado: $${feeMxn}. Se suma al siguiente pedido del cliente (o puede pagarla directo).`
          : 'El cliente canceló el trabajo.',
      );
    }
    if (chosen) {
      void this.push.notify([chosen.provider.userId], {
        title: 'El cliente canceló',
        body: feeMxn
          ? `Se registró tu cuota de traslado de $${feeMxn}.`
          : 'Ya no tienes que ir a este trabajo.',
        url: '/tequio/trabajo',
        tag: `cancelado-${requestId}`,
      });
    }
    for (const photo of requestPhotos(request)) {
      await this.storage.delete(photo.key);
    }
    await this.audit(
      auth.user.id,
      'REQUEST_CANCELLED',
      {
        requestId,
        status: request.status,
        feeMxn,
        advancedKm: fee?.advancedKm ?? 0,
        why: fee?.why ?? 'NOT_LEFT',
      },
      chosen?.providerId ?? null,
    );
    return this.requests.getMine(auth, requestId);
  }

  // ---------- Mensajes ----------

  async messages(auth: AuthContext, requestId: string) {
    const { request, role } = await this.requireParticipant(auth, requestId);
    if (
      role === 'CLIENT' &&
      !request.chosenQuoteId &&
      request.status === 'OPEN'
    ) {
      return [];
    }
    // Pasados 30 días el chat queda sellado (solo se entrega con orden de una autoridad).
    if (!userRecordOpen(request)) return [];
    const rows = await this.prisma.presenteMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    return rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      meta: m.meta,
      body: m.body,
      from:
        m.senderRole === 'SYSTEM'
          ? 'SYSTEM'
          : m.senderUserId === auth.user.id
            ? 'ME'
            : 'OTHER',
      createdAt: m.createdAt,
    }));
  }

  async sendMessage(auth: AuthContext, requestId: string, body: string) {
    const { request, role, chosen } = await this.requireParticipant(
      auth,
      requestId,
    );
    if (
      !request.chosenQuoteId ||
      !['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(
        request.status,
      )
    ) {
      throw new ConflictException(
        'Los mensajes se abren cuando eliges a un trabajador',
      );
    }
    const text = body.trim();
    await this.prisma.presenteMessage.create({
      data: {
        requestId,
        senderUserId: auth.user.id,
        senderRole: role,
        body: text,
      },
    });
    const worker = chosen?.provider;
    void this.push.notify(
      [role === 'CLIENT' ? (worker?.userId ?? '') : request.clientUserId],
      {
        title:
          role === 'CLIENT'
            ? 'Mensaje de tu cliente'
            : `Mensaje de ${worker?.displayName ?? 'tu trabajador'}`,
        body: text.length > 120 ? `${text.slice(0, 119)}…` : text,
        url:
          role === 'CLIENT' ? '/tequio/trabajo' : `/tequio/pedido/${requestId}`,
        tag: `mensaje-${requestId}`,
      },
    );
    // Si comparten teléfono, se recuerda una vez por qué conviene seguir por aquí. No se bloquea.
    if (containsPhone(text)) {
      const tipped = await this.prisma.presenteMessage.count({
        where: { requestId, kind: 'TIP' },
      });
      if (!tipped) {
        await this.prisma.presenteMessage.create({
          data: {
            requestId,
            senderUserId: auth.user.id,
            senderRole: 'SYSTEM',
            kind: 'TIP',
            body: '⚠️ Por su seguridad, mejor no compartan su número. Si se salen de Tequio ya no queda registro de lo que acuerden, no hay PIN de llegada ni grabación de llamadas, no cuentan sus estrellas, y nosotros no podremos ayudarles si algo sale mal. Para hablar, usen «Llamar por Tequio»: no muestra su número. Para otra visita, agréguense a «Mis de confianza».',
          },
        });
      }
    }
    return this.messages(auth, requestId);
  }

  /**
   * El trabajador propone la siguiente visita (seguimiento, revisión, otra consulta).
   * Le llega al cliente como mensaje con el botón para agendarla por Tequio.
   */
  async proposeFollowUp(
    auth: AuthContext,
    requestId: string,
    scheduledForIso: string,
    note?: string,
  ) {
    const { request, chosen } = await this.requireMyJob(auth, requestId);
    if (!['IN_PROGRESS', 'COMPLETED'].includes(request.status)) {
      throw new ConflictException(
        'La siguiente visita se propone durante o después del trabajo',
      );
    }
    const scheduledFor = new Date(scheduledForIso);
    const ahead = scheduledFor.getTime() - Date.now();
    if (Number.isNaN(ahead) || ahead < 60 * 60_000 || ahead > 60 * 86_400_000) {
      throw new BadRequestException(
        'Elige un día y hora a partir de 1 hora y hasta 60 días adelante',
      );
    }
    const when = scheduledFor.toLocaleString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Mexico_City',
    });
    await this.prisma.presenteMessage.create({
      data: {
        requestId,
        senderUserId: auth.user.id,
        senderRole: 'WORKER',
        kind: 'FOLLOW_UP',
        meta: {
          scheduledFor: scheduledFor.toISOString(),
          providerId: chosen.providerId,
          trades: request.trades,
          requestId,
        },
        body: `${chosen.provider.displayName} propone la siguiente visita el ${when}.${note?.trim() ? ` ${note.trim()}` : ''}`,
      },
    });
    await this.audit(
      auth.user.id,
      'FOLLOW_UP_PROPOSED',
      { requestId, scheduledFor: scheduledFor.toISOString() },
      chosen.providerId,
    );
    return this.messages(auth, requestId);
  }

  // ---------- Estrellas ----------

  async review(auth: AuthContext, requestId: string, dto: ReviewDto) {
    const { request, chosen, role } = await this.requireParticipant(
      auth,
      requestId,
    );
    if (request.status !== 'COMPLETED' || !chosen) {
      throw new ConflictException('Se califica cuando el trabajo termina');
    }
    if (request.reviews.some((r) => r.fromUserId === auth.user.id)) {
      throw new ConflictException('Ya calificaste este trabajo');
    }
    const toUserId =
      role === 'CLIENT' ? chosen.provider.userId : request.clientUserId;
    // Con factura pedida: el cliente califica cuando le llega (o a los 3 días si no llega).
    let invoiceMissing = false;
    if (role === 'CLIENT' && request.needsInvoice) {
      const sent = await this.prisma.presenteInvoice.count({
        where: { requestId },
      });
      const gate = reviewGate(request, sent > 0);
      if (!gate.open) {
        throw new ConflictException(
          `Califica cuando te llegue tu factura, o desde el ${gate.opensAt?.toLocaleDateString('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' })} si no llega`,
        );
      }
      invoiceMissing = gate.invoiceMissing;
    }
    await this.prisma.presenteReview.create({
      data: {
        requestId,
        fromUserId: auth.user.id,
        toUserId,
        toRole: role === 'CLIENT' ? 'WORKER' : 'CLIENT',
        stars: dto.stars,
        comment: dto.comment?.trim() || null,
        invoiceMissing,
      },
    });
    await this.audit(
      auth.user.id,
      'REVIEW_SENT',
      { requestId, stars: dto.stars },
      chosen.providerId,
    );
    return { reviewed: true };
  }

  // ---------- Fotos del trabajador (su trabajo, su negocio, sus cursos) ----------

  private async myProvider(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
    });
    if (!provider)
      throw new NotFoundException('Primero regístrate para trabajar');
    return provider;
  }

  async myPhotos(auth: AuthContext) {
    const provider = await this.myProvider(auth);
    const photos = await this.prisma.presenteProviderPhoto.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
    });
    return photos.map((p) => ({
      id: p.id,
      kind: p.kind,
      caption: p.caption,
      providerId: provider.id,
    }));
  }

  async addPhoto(auth: AuthContext, dto: ProviderPhotoDto) {
    const provider = await this.myProvider(auth);
    const count = await this.prisma.presenteProviderPhoto.count({
      where: { providerId: provider.id },
    });
    if (count >= MAX_PROVIDER_PHOTOS) {
      throw new ConflictException(
        `Puedes tener hasta ${MAX_PROVIDER_PHOTOS} fotos. Borra una para subir otra.`,
      );
    }
    const image = parseImageDataUrl(dto.dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
    const key = `private/presente/${provider.id}/portfolio-${randomUUID()}.bin`;
    await this.storage.put(key, image.bytes);
    await this.prisma.presenteProviderPhoto.create({
      data: {
        providerId: provider.id,
        kind: dto.kind,
        caption: dto.caption?.trim() || null,
        objectKey: key,
        mimeType: image.mimeType,
      },
    });
    return this.myPhotos(auth);
  }

  async deletePhoto(auth: AuthContext, photoId: string) {
    const provider = await this.myProvider(auth);
    const photo = await this.prisma.presenteProviderPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.providerId !== provider.id)
      throw new NotFoundException('Foto no encontrada');
    await this.storage.delete(photo.objectKey);
    await this.prisma.presenteProviderPhoto.delete({ where: { id: photoId } });
    return this.myPhotos(auth);
  }

  /** Perfil de un trabajador verificado: lo que ve quien pide ayuda antes de elegir. */
  // ---------- Su página web (Mis páginas) ----------

  /** Páginas publicadas de su negocio que puede mostrar en su perfil. */
  async mySites(auth: AuthContext) {
    const provider = await this.myProvider(auth);
    const sites = await this.prisma.site.findMany({
      where: { companyId: auth.user.companyId, status: 'published' },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    return { selectedId: provider.siteId, sites };
  }

  async setSite(auth: AuthContext, siteId: string | null) {
    const provider = await this.myProvider(auth);
    if (siteId) {
      const site = await this.prisma.site.findFirst({
        where: {
          id: siteId,
          companyId: auth.user.companyId,
          status: 'published',
        },
        select: { id: true },
      });
      if (!site) {
        throw new NotFoundException(
          'Esa página no está publicada o no es de tu negocio',
        );
      }
    }
    await this.prisma.presenteProvider.update({
      where: { id: provider.id },
      data: { siteId },
    });
    return this.mySites(auth);
  }

  async providerProfile(providerId: string) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: providerId },
      include: {
        photos: { orderBy: { createdAt: 'desc' } },
        credentials: { where: { status: 'VERIFIED' } },
      },
    });
    if (!provider || provider.status !== 'VERIFIED') {
      throw new NotFoundException('Trabajador no encontrado');
    }
    const [rating, reviews, jobs] = await Promise.all([
      this.requests.ratings([provider.userId]),
      this.prisma.presenteReview.findMany({
        where: { toUserId: provider.userId, toRole: 'WORKER' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.presenteRequest.count({
        where: {
          status: 'COMPLETED',
          quotes: { some: { providerId, status: 'ACCEPTED' } },
        },
      }),
    ]);
    // Cédula: solo si ofrece servicios de salud y está verificada en Salud.
    let license: {
      profession: string;
      number: string;
      specialty: string | null;
      lookupUrl: string;
    } | null = null;
    if (provider.trades.some((t) => CLINICAL_TRADES.includes(t))) {
      const clinical = await this.prisma.clinicalProfessionalProfile.findUnique(
        {
          where: { userId: provider.userId },
        },
      );
      if (
        clinical &&
        provider.trades.some((t) => clinicalTradeAllowed(t, clinical))
      ) {
        license = {
          profession: clinical.profession,
          number: clinical.professionalLicenseNumber,
          specialty: clinical.specialty,
          lookupUrl: SEP_LICENSE_LOOKUP_URL,
        };
      }
    }
    // Su página publicada en Yalika, si la eligió y sigue publicada.
    const site = provider.siteId
      ? await this.prisma.site.findFirst({
          where: { id: provider.siteId, status: 'published' },
          select: { name: true, slug: true },
        })
      : null;
    return {
      id: provider.id,
      displayName: provider.displayName,
      businessName: provider.businessName,
      isBusiness: provider.isBusiness,
      delivers: provider.delivers,
      teaches: provider.teaches,
      bio: provider.bio,
      trades: provider.trades,
      municipalityName:
        findMunicipality(provider.municipalityCode)?.name ?? null,
      availability: readAvailability(provider.availability),
      license,
      // Cédulas revisadas por Yalika (ingeniería, contaduría, leyes...).
      credentials: provider.credentials
        .filter((c) => provider.trades.includes(c.trade))
        .map((c) => ({
          trade: c.trade,
          number: c.licenseNumber,
          lookupUrl: SEP_LICENSE_LOOKUP_URL,
          // Comprobante de la SEP revisado: el cliente lo puede abrir y comprobar.
          sepProof: Boolean(c.sepProofKey && c.sepProofCheckedAt),
        })),
      site,
      rating: rating.get(provider.userId) ?? { average: null, count: 0 },
      completedJobs: jobs,
      memberSince: provider.reviewedAt,
      reviews: reviews.map((r) => ({
        stars: r.stars,
        comment: r.comment,
        invoiceMissing: r.invoiceMissing,
        createdAt: r.createdAt,
      })),
      photos: provider.photos.map((p) => ({
        id: p.id,
        kind: p.kind,
        caption: p.caption,
      })),
    };
  }

  /** Foto del trabajador: la ve cualquiera si está verificado, o él mismo antes de verificarse. */
  async providerPhoto(auth: AuthContext, providerId: string, photoId: string) {
    const photo = await this.prisma.presenteProviderPhoto.findUnique({
      where: { id: photoId },
      include: { provider: true },
    });
    const visible =
      photo?.provider.status === 'VERIFIED' ||
      photo?.provider.userId === auth.user.id;
    if (!photo || photo.providerId !== providerId || !visible) {
      throw new NotFoundException('Foto no encontrada');
    }
    const bytes = await this.storage.get(photo.objectKey);
    return {
      dataUrl: `data:${photo.mimeType};base64,${bytes.toString('base64')}`,
    };
  }
}
