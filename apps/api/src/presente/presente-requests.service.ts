import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthContext } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateHelpRequestDto,
  SearchProvidersDto,
  SendQuoteDto,
} from './dto/presente.dto';
import { findMunicipality, municipalityDistanceKm } from './geo/municipios';
import {
  ACTIVE_JOB,
  arrivalPin,
  busyUntil,
  careLink,
  clientCancelFee,
  gpsEta,
  isSuspended,
  appointmentSlots,
  isWithinAvailability,
  SLOT_DAYS,
  visitLabel,
} from './presente-job.domain';
import { PresenteDebtsService } from './presente-debts.service';
import { INVOICE_DAYS, ivaFor } from './presente-invoice.domain';
import { userRecordUntil } from './presente-safety.domain';
import { PresenteInvoicesService } from './presente-invoices.service';
import { PresentePlacesService, placeHint } from './presente-places.service';
import { PresentePushService } from './presente-push.service';
import { PresenteRemindersService } from './presente-reminders.service';
import { PresenteStorageService } from './presente-storage.service';
import { PresenteWalletService } from './presente-wallet.service';
import {
  CLINICAL_TRADES,
  CONFIRM_HOURS,
  PENDING_TRADES,
  RECHECK_DOCUMENT_KIND,
  MAX_OPEN_REQUESTS,
  MAX_REQUEST_PHOTOS,
  REQUEST_TTL_HOURS,
} from './presente.constants';
import {
  clinicalTradeAllowed,
  effectivePresence,
  identityRecheck,
  isRequestOpen,
  parseImageDataUrl,
  readAvailability,
  requestStatus,
  reachKm,
  serveDistanceKm,
  type ServeProvider,
} from './presente.domain';

type RequestWithQuotes = Prisma.PresenteRequestGetPayload<{
  include: { quotes: { include: { provider: true } }; reviews: true };
}>;

export type Rating = { average: number | null; count: number };

const IMAGE_MESSAGES: Record<string, string> = {
  FORMAT: 'La foto debe ser JPG, PNG o WEBP.',
  TOO_SMALL: 'La foto salió muy pequeña o borrosa. Tómala de nuevo.',
  TOO_LARGE: 'La foto es muy pesada. Tómala de nuevo.',
};

type StoredPhoto = { key: string; mime: string };

/** Fotos del pedido: la primera (photoKey) y las extra. */
export function requestPhotos(request: {
  photoKey: string | null;
  photoMime: string | null;
  extraPhotos: unknown;
}): StoredPhoto[] {
  const list: StoredPhoto[] = [];
  if (request.photoKey && request.photoMime) {
    list.push({ key: request.photoKey, mime: request.photoMime });
  }
  if (Array.isArray(request.extraPhotos)) {
    for (const item of request.extraPhotos as unknown[]) {
      const photo = item as Partial<StoredPhoto> | null;
      if (typeof photo?.key === 'string' && typeof photo.mime === 'string') {
        list.push({ key: photo.key, mime: photo.mime });
      }
    }
  }
  return list;
}

const municipalityName = (code: string | null | undefined) =>
  findMunicipality(code)?.name ?? null;

const requestInclude = {
  quotes: { include: { provider: true } },
  reviews: true,
} as const;

type QuotableRequest = {
  trades: string[];
  municipalityCode: string;
  clientUserId: string;
  targetProviderId: string | null;
  needsInvoice?: boolean;
};

/** Número de pedidos y los oficios tuyos que piden (los más pedidos primero). */
function waitingFrom(requests: { trades: string[] }[], mine: string[]) {
  const counts = new Map<string, number>();
  for (const r of requests)
    for (const t of r.trades)
      if (mine.includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return {
    count: requests.length,
    trades: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([trade]) => trade)
      .slice(0, 3),
  };
}

/**
 * Pedidos de ayuda (cliente) y presupuestos (trabajador).
 * El punto exacto, la referencia y la foto de la casa solo los ve el trabajador elegido.
 */
@Injectable()
export class PresenteRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PresenteStorageService,
    private readonly wallet: PresenteWalletService,
    private readonly places: PresentePlacesService,
    private readonly reminders: PresenteRemindersService,
    private readonly debts: PresenteDebtsService,
    private readonly push: PresentePushService,
    private readonly invoices: PresenteInvoicesService,
  ) {}

  /** Texto corto del pedido para el aviso del celular. */
  private static short(text: string, max = 90) {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  }

  /**
   * Aviso de pedido nuevo, solo a quien está prendido (Presente): al trabajador de confianza si
   * es directo; si no, a los que hacen ese oficio y llegan a esa zona. No espera a que se entreguen.
   */
  private announce(
    request: {
      id: string;
      trades: string[];
      municipalityCode: string;
      clientUserId: string;
      description: string;
      targetProviderId: string | null;
    },
    now: Date,
  ) {
    void (async () => {
      // Solo a quien está prendido: apagado ve los trabajos al entrar, sin avisos que molesten.
      const users = request.targetProviderId
        ? (
            await this.prisma.presenteProvider.findMany({
              where: { id: request.targetProviderId, status: 'VERIFIED' },
            })
          )
            .filter((p) => effectivePresence(p, now) === 'PRESENT')
            .map((p) => p.userId)
        : (await this.nearbyProviders(request, now)).map((p) => p.userId);
      const where = municipalityName(request.municipalityCode) ?? 'cerca de ti';
      await this.push.notify(users, {
        title: request.targetProviderId
          ? 'Te pidieron un trabajo a ti'
          : `Pedido nuevo en ${where}`,
        body: `${PresenteRequestsService.short(request.description)} · Manda tu precio.`,
        url: '/tequio',
        tag: `pedido-${request.id}`,
      });
    })().catch(() => undefined);
  }

  /**
   * Cuánto pagaría el cliente si cancela ahora: se calcula con el primer y el último punto del
   * recorrido del trabajador (cuánto se acercó a la casa).
   */
  async cancelFeeFor(
    request: {
      id: string;
      status: string;
      closedAt: Date | null;
      etaAt: Date | null;
      lat: number | null;
      lng: number | null;
    },
    priceMxn: number,
    now = new Date(),
  ) {
    const moving = request.status === 'EN_ROUTE';
    const [start, last] = moving
      ? await Promise.all([
          this.prisma.presenteTrackPoint.findFirst({
            where: { requestId: request.id },
            orderBy: { recordedAt: 'asc' },
          }),
          this.prisma.presenteTrackPoint.findFirst({
            where: { requestId: request.id },
            orderBy: { recordedAt: 'desc' },
          }),
        ])
      : [null, null];
    return clientCancelFee(
      {
        status: request.status,
        closedAt: request.closedAt,
        etaAt: request.etaAt,
        priceMxn,
        home:
          request.lat != null && request.lng != null
            ? { lat: request.lat, lng: request.lng }
            : null,
        start,
        last,
      },
      now,
    );
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

  /** Promedio de estrellas recibidas por cada usuario. */
  async ratings(userIds: string[]): Promise<Map<string, Rating>> {
    const result = new Map<string, Rating>();
    if (!userIds.length) return result;
    const rows = await this.prisma.presenteReview.groupBy({
      by: ['toUserId'],
      where: { toUserId: { in: userIds } },
      _avg: { stars: true },
      _count: { _all: true },
    });
    for (const row of rows) {
      result.set(row.toUserId, {
        average:
          row._avg.stars === null ? null : Math.round(row._avg.stars * 10) / 10,
        count: row._count._all,
      });
    }
    return result;
  }

  /** Hasta qué hora está ocupado cada trabajador por un trabajo activo. */
  async busyByProvider(providerIds: string[], now: Date) {
    const result = new Map<string, Date>();
    if (!providerIds.length) return result;
    const accepted = await this.prisma.presenteQuote.findMany({
      where: {
        providerId: { in: providerIds },
        status: 'ACCEPTED',
        request: { status: { in: ACTIVE_JOB } },
      },
      include: { request: true },
    });
    for (const quote of accepted) {
      const until = busyUntil(quote.request, quote.durationMinutes, now);
      const current = result.get(quote.providerId);
      if (until && (!current || until > current))
        result.set(quote.providerId, until);
    }
    return result;
  }

  /**
   * ¿Puede este trabajador cotizar el pedido?
   * - Pedido directo a él: sí (aunque esté Ausente o lejos), mientras no esté de baja.
   * - Pedido abierto a todos: si está Presente, con el oficio y dentro de su rango.
   */
  canQuote(
    provider: ServeProvider & {
      id: string;
      userId: string;
      invoices?: boolean;
    },
    request: QuotableRequest,
    now = new Date(),
  ) {
    if (request.clientUserId === provider.userId) return false;
    // Quien pide factura solo recibe precios de quienes facturan.
    if (request.needsInvoice && !provider.invoices) return false;
    if (request.targetProviderId) {
      return (
        request.targetProviderId === provider.id &&
        provider.status === 'VERIFIED' &&
        !isSuspended(provider, now)
      );
    }
    // Aunque esté apagado (Ausente) puede ver el trabajo y mandar su precio; de baja temporal, no.
    return (
      provider.status === 'VERIFIED' &&
      !isSuspended(provider, now) &&
      reachKm(provider, request) !== null
    );
  }

  private async findRequest(id: string) {
    const request = await this.prisma.presenteRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Pedido no encontrado');
    return request;
  }

  private async requireOwnRequest(auth: AuthContext, id: string) {
    const request = await this.findRequest(id);
    // A quien no es dueño se le responde igual que si no existiera.
    if (request.clientUserId !== auth.user.id) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return request;
  }

  private async requireWorkingProvider(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
    });
    if (!provider || provider.status !== 'VERIFIED') {
      throw new ForbiddenException('Solo trabajadores verificados');
    }
    return provider;
  }

  /** Lo que ve el cliente de su pedido: presupuestos mientras está abierto; después, su trabajo. */
  async clientView(request: RequestWithQuotes, now = new Date()) {
    const status = requestStatus(request, now);
    const visibleQuotes = request.quotes.filter((q) =>
      status === 'OPEN' ? q.status === 'SENT' : q.id === request.chosenQuoteId,
    );
    const ratings = await this.ratings(
      visibleQuotes.map((q) => q.provider.userId),
    );
    const favorites = new Set(
      (
        await this.prisma.presenteFavorite.findMany({
          where: { clientUserId: request.clientUserId },
          select: { providerId: true },
        })
      ).map((f) => f.providerId),
    );
    const busy =
      status === 'OPEN'
        ? await this.busyByProvider(
            visibleQuotes.map((q) => q.providerId),
            now,
          )
        : new Map<string, Date>();

    const providerCard = (quote: (typeof visibleQuotes)[number]) => ({
      id: quote.providerId,
      displayName: quote.provider.displayName,
      isBusiness: quote.provider.isBusiness,
      businessName: quote.provider.businessName,
      bio: quote.provider.bio,
      trades: quote.provider.trades,
      municipalityName: municipalityName(quote.provider.municipalityCode),
      availability: readAvailability(quote.provider.availability),
      verified: quote.provider.status === 'VERIFIED',
      rating: ratings.get(quote.provider.userId) ?? { average: null, count: 0 },
      busyUntil: busy.get(quote.providerId) ?? null,
      isFavorite: favorites.has(quote.providerId),
    });

    const chosen = request.quotes.find((q) => q.id === request.chosenQuoteId);
    let lastLocation: { lat: number; lng: number; at: Date } | null = null;
    if (chosen && request.status === 'EN_ROUTE') {
      const point = await this.prisma.presenteTrackPoint.findFirst({
        where: { requestId: request.id },
        orderBy: { recordedAt: 'desc' },
      });
      if (point)
        lastLocation = { lat: point.lat, lng: point.lng, at: point.recordedAt };
    }
    const myReview = request.reviews.find(
      (r) => r.fromUserId === request.clientUserId,
    );

    let target: { id: string; displayName: string } | null = null;
    if (request.targetProviderId && status === 'OPEN') {
      const provider = await this.prisma.presenteProvider.findUnique({
        where: { id: request.targetProviderId },
        select: { id: true, displayName: true },
      });
      target = provider;
    }

    return {
      id: request.id,
      trades: request.trades,
      careLink: careLink(request.trades),
      direct: Boolean(request.targetProviderId),
      target,
      scheduledFor: request.scheduledFor,
      followUpOfId: request.followUpOfId,
      description: request.description,
      municipalityCode: request.municipalityCode,
      municipalityName: municipalityName(request.municipalityCode),
      addressHint: request.addressHint,
      lat: request.lat,
      lng: request.lng,
      urgency: request.urgency,
      status,
      needsInvoice: request.needsInvoice,
      // Su factura, cuando el profesional ya la mandó.
      invoice: request.needsInvoice
        ? await this.invoices.forRequest(request.id)
        : null,
      // Hasta cuándo los dos pueden ver y descargar su sábana de seguridad.
      recordUntil: userRecordUntil(request),
      // Con factura pedida, desde cuándo puede calificar si no llega.
      reviewOpensAt:
        request.needsInvoice && request.finishedAt
          ? new Date(request.finishedAt.getTime() + INVOICE_DAYS * 86_400_000)
          : null,
      hasPhoto: Boolean(request.photoKey),
      photoCount: requestPhotos(request).length,
      placeLabel: request.placeLabel,
      placeId: request.placeId,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      chosenQuoteId: request.chosenQuoteId,
      cancelledBy: request.cancelledBy,
      cancelFeeMxn: request.cancelFeeMxn,
      quotes:
        status === 'OPEN'
          ? visibleQuotes
              .sort((a, b) => a.amountMxn - b.amountMxn)
              .map((quote) => ({
                id: quote.id,
                amountMxn: quote.amountMxn,
                ivaMxn: request.needsInvoice ? ivaFor(quote.amountMxn) : 0,
                etaMinutes: quote.etaMinutes,
                durationMinutes: quote.durationMinutes,
                note: quote.note,
                proposedFor: quote.proposedFor,
                provider: providerCard(quote),
              }))
          : [],
      job: chosen
        ? {
            provider: providerCard(chosen),
            amountMxn: chosen.amountMxn,
            // Con factura: IVA del precio final (o del presupuesto mientras no termina).
            ivaMxn: request.needsInvoice
              ? ivaFor(request.finalAmountMxn ?? chosen.amountMxn)
              : 0,
            etaMinutes: chosen.etaMinutes,
            durationMinutes: chosen.durationMinutes,
            finalAmountMxn: request.finalAmountMxn,
            clientConfirmedAt: request.clientConfirmedAt,
            autoConfirmed: request.autoConfirmed,
            problemAt: request.problemAt,
            confirmBy: request.finishedAt
              ? new Date(
                  request.finishedAt.getTime() + CONFIRM_HOURS * 3_600_000,
                )
              : null,
            enRouteAt: request.enRouteAt,
            etaAt: request.etaAt,
            delayNote: request.delayNote,
            delayCount: request.delayCount,
            // Cuánto le falta según su GPS (en línea recta, sin tráfico).
            gps:
              lastLocation && request.lat != null && request.lng != null
                ? gpsEta(lastLocation, { lat: request.lat, lng: request.lng })
                : null,
            arrivedAt: request.arrivedAt,
            startedAt: request.startedAt,
            estimatedMinutes: request.estimatedMinutes,
            finishedAt: request.finishedAt,
            // El PIN se lo dice el cliente al trabajador cuando llega.
            pin: ['ASSIGNED', 'EN_ROUTE'].includes(request.status)
              ? arrivalPin(request.id)
              : null,
            lastLocation,
            // Adeudo anterior que se suma a este pedido y cuánto costaría cancelar ahora.
            debtMxn: await this.debts.totalFor(request.id),
            cancelFee: await this.cancelFeeFor(request, chosen.amountMxn, now),
          }
        : null,
      reviewed: Boolean(myReview),
    };
  }

  // ---------- Cliente ----------

  async create(auth: AuthContext, dto: CreateHelpRequestDto) {
    const trades = Array.from(new Set(dto.trades));
    if (trades.some((trade) => PENDING_TRADES.includes(trade))) {
      throw new BadRequestException('Ese servicio todavía no está disponible');
    }
    // Con factura: se guarda una copia de sus datos fiscales (si faltan, se le pide llenarlos).
    const invoiceData = dto.needsInvoice
      ? await this.invoices.snapshot(auth.user.id)
      : null;
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId: auth.user.id },
    });
    if (!client) {
      throw new ConflictException(
        'Primero completa tus datos para pedir ayuda',
      );
    }
    // El lugar: uno guardado (Casa, Casa de mamá...) o un punto marcado en el mapa.
    let where: {
      municipalityCode: string;
      lat: number;
      lng: number;
      addressHint: string | null;
      placeId: string | null;
      placeLabel: string | null;
    };
    if (dto.placeId) {
      const place = await this.places.own(auth, dto.placeId);
      if (!place.street.trim()) {
        throw new BadRequestException(
          `Completa la calle y el número de «${place.label}» en Mis datos`,
        );
      }
      where = {
        municipalityCode: place.municipalityCode,
        lat: place.lat,
        lng: place.lng,
        addressHint: placeHint(place).slice(0, 300),
        placeId: place.id,
        placeLabel: place.label,
      };
    } else {
      if (
        !dto.municipalityCode ||
        !findMunicipality(dto.municipalityCode) ||
        dto.lat == null ||
        dto.lng == null
      ) {
        throw new BadRequestException(
          'Elige el municipio y el punto a donde deben llegar',
        );
      }
      where = {
        municipalityCode: dto.municipalityCode,
        lat: dto.lat,
        lng: dto.lng,
        addressHint: dto.addressHint?.trim() || null,
        placeId: null,
        placeLabel: null,
      };
    }

    const now = new Date();
    const open = await this.prisma.presenteRequest.count({
      where: {
        clientUserId: auth.user.id,
        OR: [
          { status: 'OPEN', expiresAt: { gt: now } },
          { status: { in: ACTIVE_JOB } },
        ],
      },
    });
    if (open >= MAX_OPEN_REQUESTS) {
      throw new ConflictException(
        `Ya tienes ${MAX_OPEN_REQUESTS} pedidos en curso. Termina o cancela uno antes de pedir otro.`,
      );
    }

    let scheduledFor: Date | null = null;
    if (dto.scheduledFor) {
      scheduledFor = new Date(dto.scheduledFor);
      const ahead = scheduledFor.getTime() - now.getTime();
      if (
        Number.isNaN(ahead) ||
        ahead < 10 * 60_000 ||
        ahead > 60 * 86_400_000
      ) {
        throw new BadRequestException(
          'Elige un día y hora a partir de 10 minutos y hasta 60 días adelante',
        );
      }
    }

    let targetProviderId: string | null = null;
    if (dto.providerId) {
      const target = await this.prisma.presenteProvider.findUnique({
        where: { id: dto.providerId },
      });
      if (
        !target ||
        target.status !== 'VERIFIED' ||
        target.userId === auth.user.id
      ) {
        throw new NotFoundException('Ese trabajador no está disponible');
      }
      if (isSuspended(target, now)) {
        throw new ConflictException(
          'Ese trabajador no está recibiendo pedidos por ahora',
        );
      }
      if (trades.some((trade) => !target.trades.includes(trade))) {
        throw new BadRequestException(
          `${target.displayName} no ofrece todo lo que pediste. Quita lo que no hace o pide a todos.`,
        );
      }
      if (
        scheduledFor &&
        !isWithinAvailability(
          readAvailability(target.availability),
          scheduledFor,
        )
      ) {
        throw new BadRequestException(
          `${target.displayName} no atiende ese día y hora. Elige otro dentro de su horario.`,
        );
      }
      targetProviderId = target.id;
    }

    let followUpOfId: string | null = null;
    if (dto.followUpOfId) {
      const previous = await this.prisma.presenteRequest.findUnique({
        where: { id: dto.followUpOfId },
        select: { clientUserId: true },
      });
      if (!previous || previous.clientUserId !== auth.user.id) {
        throw new NotFoundException('Visita anterior no encontrada');
      }
      followUpOfId = dto.followUpOfId;
    }

    const id = randomUUID();
    const dataUrls = [
      ...(dto.photoDataUrl ? [dto.photoDataUrl] : []),
      ...(dto.photoDataUrls ?? []),
    ];
    if (dataUrls.length > MAX_REQUEST_PHOTOS) {
      throw new BadRequestException(
        `Puedes mandar hasta ${MAX_REQUEST_PHOTOS} fotos`,
      );
    }
    const images = dataUrls.map((dataUrl) => {
      const image = parseImageDataUrl(dataUrl);
      if (!image.ok)
        throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
      return image;
    });
    const stored: StoredPhoto[] = [];
    for (const image of images) {
      const key = `private/presente/requests/${id}/photo-${randomUUID()}.bin`;
      await this.storage.put(key, image.bytes);
      stored.push({ key, mime: image.mimeType });
    }
    const [first, ...extra] = stored;

    const created = await this.prisma.presenteRequest.create({
      data: {
        id,
        clientUserId: auth.user.id,
        trades,
        description: dto.description.trim(),
        ...where,
        urgency: dto.urgency,
        photoKey: first?.key ?? null,
        photoMime: first?.mime ?? null,
        extraPhotos: extra.length ? extra : undefined,
        targetProviderId,
        scheduledFor,
        followUpOfId,
        needsInvoice: Boolean(invoiceData),
        invoiceData: invoiceData ?? undefined,
        // Un pedido agendado sigue abierto hasta la hora de la visita.
        expiresAt:
          scheduledFor ??
          new Date(now.getTime() + REQUEST_TTL_HOURS[dto.urgency] * 3_600_000),
      },
      include: requestInclude,
    });
    await this.audit(auth.user.id, 'REQUEST_CREATED', {
      requestId: id,
      trades,
      municipalityCode: where.municipalityCode,
      direct: Boolean(targetProviderId),
      scheduled: Boolean(scheduledFor),
    });

    this.announce(created, now);

    return {
      ...(await this.clientView(created, now)),
      nearbyPresent: targetProviderId
        ? 1
        : await this.countNearby(created, now),
    };
  }

  /** Cuántos trabajadores Presentes pueden atender un pedido abierto a todos. */
  private async countNearby(
    request: {
      trades: string[];
      municipalityCode: string;
      clientUserId: string;
      needsInvoice?: boolean;
    },
    now: Date,
  ) {
    return (await this.nearbyProviders(request, now)).length;
  }

  /** Trabajadores Presentes que hacen ese oficio y llegan a esa zona. */
  private async nearbyProviders(
    request: {
      trades: string[];
      municipalityCode: string;
      clientUserId: string;
      needsInvoice?: boolean;
    },
    now: Date,
  ) {
    const providers = await this.prisma.presenteProvider.findMany({
      where: {
        status: 'VERIFIED',
        presence: 'PRESENT',
        trades: { hasSome: request.trades },
        userId: { not: request.clientUserId },
      },
    });
    return providers.filter(
      (p) =>
        serveDistanceKm(p, request, now) !== null &&
        (!request.needsInvoice || p.invoices),
    );
  }

  async listMine(auth: AuthContext) {
    const requests = await this.prisma.presenteRequest.findMany({
      where: { clientUserId: auth.user.id },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const now = new Date();
    return Promise.all(
      requests.map(async (request) => {
        const chosen = request.quotes.find(
          (q) => q.id === request.chosenQuoteId,
        );
        const live = chosen && ['EN_ROUTE', 'ARRIVED'].includes(request.status);
        // Hora aproximada de llegada: la que avisó al salir o, si no ha salido, la de su presupuesto.
        const arriveBy =
          request.etaAt ??
          (chosen && request.status === 'ASSIGNED'
            ? new Date(chosen.updatedAt.getTime() + chosen.etaMinutes * 60_000)
            : null);
        return {
          id: request.id,
          trades: request.trades,
          status: requestStatus(request, now),
          direct: Boolean(request.targetProviderId),
          scheduledFor: request.scheduledFor,
          quotesCount: request.quotes.filter((q) => q.status === 'SENT').length,
          placeLabel: request.placeLabel,
          createdAt: request.createdAt,
          // Para la burbuja de "cómo va": solo lo necesario, sin datos de la casa.
          providerName: chosen
            ? chosen.provider.businessName || chosen.provider.displayName
            : null,
          arriveBy,
          arrivedAt: request.arrivedAt,
          endAt:
            request.startedAt && request.estimatedMinutes
              ? new Date(
                  request.startedAt.getTime() +
                    request.estimatedMinutes * 60_000,
                )
              : null,
          finishedAt: request.finishedAt,
          clientConfirmedAt: request.clientConfirmedAt,
          // Para el botón Cancelar de la burbuja: cuánto pagaría si cancela ahora.
          cancelFeeNowMxn: live
            ? (await this.cancelFeeFor(request, chosen.amountMxn, now))
                .amountMxn
            : 0,
        };
      }),
    );
  }

  async getMine(auth: AuthContext, id: string) {
    const request = await this.requireOwnRequest(auth, id);
    const now = new Date();
    return {
      ...(await this.clientView(request, now)),
      nearbyPresent: !isRequestOpen(request, now)
        ? 0
        : request.targetProviderId
          ? 1
          : await this.countNearby(request, now),
    };
  }

  /** Un pedido directo que nadie contestó se abre a todos los trabajadores cerca. */
  async openToAll(auth: AuthContext, id: string) {
    const request = await this.requireOwnRequest(auth, id);
    if (!isRequestOpen(request) || !request.targetProviderId) {
      throw new ConflictException(
        'Este pedido ya está abierto a todos o ya no está abierto',
      );
    }
    await this.prisma.presenteRequest.update({
      where: { id },
      data: { targetProviderId: null },
    });
    await this.audit(auth.user.id, 'REQUEST_OPENED_TO_ALL', { requestId: id });
    this.announce({ ...request, targetProviderId: null }, new Date());
    return this.getMine(auth, id);
  }

  async choose(auth: AuthContext, id: string, quoteId: string) {
    const request = await this.requireOwnRequest(auth, id);
    if (!isRequestOpen(request)) {
      throw new ConflictException('Este pedido ya no está abierto');
    }
    const quote = request.quotes.find(
      (q) => q.id === quoteId && q.status === 'SENT',
    );
    if (!quote)
      throw new NotFoundException('Ese presupuesto ya no está disponible');

    const now = new Date();
    // Cita: si el trabajador propuso otra hora, al elegirlo se acepta esa.
    const visitAt = quote.proposedFor ?? request.scheduledFor;
    // En una visita agendada, la llegada es a la hora de la cita.
    const etaAt =
      visitAt && visitAt > now
        ? visitAt
        : new Date(now.getTime() + quote.etaMinutes * 60_000);
    await this.prisma.$transaction([
      this.prisma.presenteRequest.update({
        where: { id },
        data: {
          status: 'ASSIGNED',
          chosenQuoteId: quote.id,
          closedAt: now,
          etaAt,
          ...(quote.proposedFor ? { scheduledFor: quote.proposedFor } : {}),
        },
      }),
      this.prisma.presenteQuote.update({
        where: { id: quote.id },
        data: { status: 'ACCEPTED' },
      }),
      this.prisma.presenteQuote.updateMany({
        where: { requestId: id, id: { not: quote.id }, status: 'SENT' },
        data: { status: 'DECLINED' },
      }),
      this.prisma.presenteMessage.create({
        data: {
          requestId: id,
          senderUserId: auth.user.id,
          senderRole: 'SYSTEM',
          body: visitAt
            ? `Ya puede ver tu ubicación y escribirte por aquí. Cita confirmada con ${quote.provider.displayName} para el ${visitLabel(visitAt)}`
            : `Elegiste a ${quote.provider.displayName}. Ya puede ver tu ubicación y escribirte por aquí.`,
        },
      }),
    ]);
    // Lo que debía por una cancelación anterior se suma a este pedido.
    const debtMxn = await this.debts.attach(auth.user.id, id);
    if (debtMxn) {
      await this.prisma.presenteMessage.create({
        data: {
          requestId: id,
          senderUserId: auth.user.id,
          senderRole: 'SYSTEM',
          body: `A este pedido se suman $${debtMxn} de una cancelación anterior. Se pagan junto con el trabajo a ${quote.provider.displayName}.`,
        },
      });
    }
    // Visita agendada: recordatorio en "Mi día" del cliente y del trabajador.
    if (visitAt && visitAt > now) {
      const client = await this.prisma.presenteClient.findUnique({
        where: { userId: auth.user.id },
        select: { displayName: true },
      });
      await this.reminders.scheduleVisit({
        requestId: id,
        scheduledFor: visitAt,
        clientUserId: auth.user.id,
        clientName: client?.displayName ?? 'tu cliente',
        workerUserId: quote.provider.userId,
        workerName: quote.provider.businessName || quote.provider.displayName,
        placeLabel: request.placeLabel,
      });
    }
    void this.push.notify([quote.provider.userId], {
      title: '¡Te eligieron!',
      body: `${PresenteRequestsService.short(request.description, 70)}${request.placeLabel ? ` · ${request.placeLabel}` : ''}. Abre tu panel para ver la dirección.`,
      url: '/tequio/trabajo',
      tag: `elegido-${id}`,
    });
    await this.audit(
      auth.user.id,
      'QUOTE_CHOSEN',
      { requestId: id, quoteId: quote.id, amountMxn: quote.amountMxn },
      quote.providerId,
    );
    return this.getMine(auth, id);
  }

  /**
   * Agregar una foto al pedido (la llanta, la chapa, la fuga). Se mandan una por una para no
   * pasar el tamaño máximo de cada envío; solo el dueño y mientras sigue abierto.
   */
  async addPhoto(auth: AuthContext, id: string, dataUrl: string) {
    const request = await this.requireOwnRequest(auth, id);
    if (!isRequestOpen(request)) {
      throw new ConflictException('Este pedido ya no está abierto');
    }
    const current = requestPhotos(request);
    if (current.length >= MAX_REQUEST_PHOTOS) {
      throw new BadRequestException(
        `Puedes mandar hasta ${MAX_REQUEST_PHOTOS} fotos`,
      );
    }
    const image = parseImageDataUrl(dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
    const key = `private/presente/requests/${id}/photo-${randomUUID()}.bin`;
    await this.storage.put(key, image.bytes);
    const photo = { key, mime: image.mimeType };
    await this.prisma.presenteRequest.update({
      where: { id },
      data: current.length
        ? { extraPhotos: [...current.slice(1), photo] }
        : { photoKey: key, photoMime: image.mimeType },
    });
    return { photoCount: current.length + 1 };
  }

  /** Foto del pedido: el dueño, el trabajador elegido o uno que hoy lo puede cotizar. */
  async photo(auth: AuthContext, id: string, index = 0) {
    const request = await this.findRequest(id);
    const photo = requestPhotos(request)[index];
    if (!photo) {
      throw new NotFoundException('Este pedido no tiene foto');
    }
    let allowed = request.clientUserId === auth.user.id;
    if (!allowed) {
      const provider = await this.prisma.presenteProvider.findUnique({
        where: { userId: auth.user.id },
      });
      const chosen = request.quotes.find((q) => q.id === request.chosenQuoteId);
      allowed = Boolean(
        provider &&
        ((chosen && chosen.providerId === provider.id) ||
          (isRequestOpen(request) && this.canQuote(provider, request))),
      );
    }
    if (!allowed) throw new NotFoundException('Pedido no encontrado');
    const bytes = await this.storage.get(photo.key);
    return {
      dataUrl: `data:${photo.mime};base64,${bytes.toString('base64')}`,
    };
  }

  // ---------- Trabajador ----------

  /**
   * Pedidos que el trabajador puede cotizar: los que le piden a él directo y los abiertos de sus
   * oficios dentro de su rango. Los ve aunque esté apagado (Ausente); estar Presente solo decide
   * si le llegan avisos y si los clientes lo ven disponible.
   */
  async nearby(auth: AuthContext) {
    const provider = await this.requireWorkingProvider(auth);
    const now = new Date();
    if (isSuspended(provider, now)) {
      return {
        present: false,
        suspendedUntil: provider.suspendedUntil,
        busyUntil: null,
        requests: [],
        waiting: { count: 0, trades: [] },
      };
    }
    const present = effectivePresence(provider, now) === 'PRESENT';
    const requests = await this.prisma.presenteRequest.findMany({
      where: {
        status: 'OPEN',
        expiresAt: { gt: now },
        clientUserId: { not: provider.userId },
        // Apagado o prendido, ve los trabajos de lo que sabe hacer; los avisos son aparte.
        OR: [
          { targetProviderId: provider.id },
          { targetProviderId: null, trades: { hasSome: provider.trades } },
        ],
      },
      include: { quotes: { where: { providerId: provider.id } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const clientRatings = await this.ratings(
      requests.map((r) => r.clientUserId),
    );
    const busy =
      (await this.busyByProvider([provider.id], now)).get(provider.id) ?? null;
    const items = requests
      .filter((request) => this.canQuote(provider, request, now))
      .map((request) => ({
        request,
        km:
          (provider.municipalityCode &&
            municipalityDistanceKm(
              provider.municipalityCode,
              request.municipalityCode,
            )) ||
          0,
      }))
      .sort(
        (a, b) =>
          Number(Boolean(b.request.targetProviderId)) -
            Number(Boolean(a.request.targetProviderId)) ||
          a.km - b.km ||
          b.request.createdAt.getTime() - a.request.createdAt.getTime(),
      )
      .slice(0, 50)
      .map(({ request, km }) => {
        const mine = request.quotes[0];
        return {
          id: request.id,
          trades: request.trades,
          careLink: careLink(request.trades),
          direct: Boolean(request.targetProviderId),
          scheduledFor: request.scheduledFor,
          description: request.description,
          municipalityName: municipalityName(request.municipalityCode),
          distanceKm: Math.round(km),
          urgency: request.urgency,
          needsInvoice: request.needsInvoice,
          hasPhoto: Boolean(request.photoKey),
          photoCount: requestPhotos(request).length,
          clientRating: clientRatings.get(request.clientUserId) ?? {
            average: null,
            count: 0,
          },
          createdAt: request.createdAt,
          expiresAt: request.expiresAt,
          myQuote: mine
            ? {
                amountMxn: mine.amountMxn,
                etaMinutes: mine.etaMinutes,
                durationMinutes: mine.durationMinutes,
                note: mine.note,
                proposedFor: mine.proposedFor,
              }
            : null,
        };
      });
    return {
      present,
      suspendedUntil: null,
      busyUntil: busy,
      requests: items,
      waiting: waitingFrom(
        items.filter((r) => !r.direct),
        provider.trades,
      ),
    };
  }

  async sendQuote(auth: AuthContext, requestId: string, dto: SendQuoteDto) {
    const provider = await this.requireWorkingProvider(auth);
    const request = await this.findRequest(requestId);
    const now = new Date();
    if (
      !isRequestOpen(request, now) ||
      !this.canQuote(provider, request, now)
    ) {
      throw new ConflictException(
        'Ya no puedes cotizar este pedido (cerró, venció o salió de tu rango)',
      );
    }
    // Como apagado también puede cotizar, aquí se revisa igual que al ponerse Presente.
    if (identityRecheck(provider, false, now)?.state === 'OVERDUE') {
      const pending = await this.prisma.presenteDocument.count({
        where: { providerId: provider.id, kind: RECHECK_DOCUMENT_KIND },
      });
      if (!pending) {
        throw new ConflictException(
          'Manda tu selfie nueva para revalidar tu identidad y poder mandar precios (Cuenta › Verificación)',
        );
      }
    }
    // Servicios de salud: la cédula debe seguir verificada en Salud al cotizar.
    const shared = request.trades.filter((t) => provider.trades.includes(t));
    if (shared.length && shared.every((t) => CLINICAL_TRADES.includes(t))) {
      const [license, approved] = await Promise.all([
        this.prisma.clinicalProfessionalProfile.findUnique({
          where: { userId: provider.userId },
          select: { profession: true, verificationStatus: true, active: true },
        }),
        // O su cédula aprobada en Tequio.
        this.prisma.presenteCredential.count({
          where: {
            providerId: provider.id,
            trade: { in: shared },
            status: 'VERIFIED',
          },
        }),
      ]);
      if (!approved && !shared.some((t) => clinicalTradeAllowed(t, license))) {
        throw new ConflictException(
          'Tu cédula ya no aparece verificada en Salud; revisa tu perfil profesional',
        );
      }
    }
    await this.wallet.requireBalance(provider);
    // Cita: puede aceptar la hora que le pidieron o proponer otra dentro de su horario.
    let proposedFor: Date | null = null;
    if (dto.proposedFor) {
      if (!request.scheduledFor) {
        throw new BadRequestException(
          'Solo en las citas se puede proponer otra hora',
        );
      }
      proposedFor = new Date(dto.proposedFor);
      const ahead = proposedFor.getTime() - now.getTime();
      if (
        Number.isNaN(ahead) ||
        ahead < 60 * 60_000 ||
        ahead > 60 * 86_400_000
      ) {
        throw new BadRequestException(
          'Propón un día y hora a partir de 1 hora y hasta 60 días adelante',
        );
      }
      if (
        !isWithinAvailability(
          readAvailability(provider.availability),
          proposedFor,
        )
      ) {
        throw new BadRequestException(
          'Esa hora está fuera de tu horario. Cambia tu horario o propón otra.',
        );
      }
      if (proposedFor.getTime() === request.scheduledFor.getTime()) {
        proposedFor = null;
      }
    }
    const data = {
      amountMxn: dto.amountMxn,
      etaMinutes: dto.etaMinutes,
      durationMinutes: dto.durationMinutes,
      note: dto.note?.trim() || null,
      proposedFor,
      status: 'SENT',
    };
    await this.prisma.presenteQuote.upsert({
      where: { requestId_providerId: { requestId, providerId: provider.id } },
      create: { requestId, providerId: provider.id, ...data },
      update: data,
    });
    await this.audit(
      auth.user.id,
      'QUOTE_SENT',
      { requestId, amountMxn: dto.amountMxn, etaMinutes: dto.etaMinutes },
      provider.id,
    );
    const worker = provider.businessName || provider.displayName;
    const price = `$${dto.amountMxn.toLocaleString('es-MX')}`;
    void this.push.notify([request.clientUserId], {
      title: !request.scheduledFor
        ? `Presupuesto de ${worker}`
        : proposedFor
          ? `${worker} te propone otra hora`
          : `${worker} acepta tu cita`,
      body: !request.scheduledFor
        ? `${price} · llega en ${dto.etaMinutes} min. Entra y elige el que te convenga.`
        : `${visitLabel(proposedFor ?? request.scheduledFor)} · ${price}. Entra para confirmar.`,
      url: `/tequio/pedido/${requestId}`,
      tag: `presupuesto-${requestId}-${provider.id}`,
    });
    return this.nearby(auth);
  }

  /** Horarios libres para pedirle cita (estilo chat: el cliente elige uno y él responde). */
  async slots(providerId: string, now = new Date()) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: providerId },
    });
    if (
      !provider ||
      provider.status !== 'VERIFIED' ||
      isSuspended(provider, now)
    ) {
      throw new NotFoundException('Ese trabajador no está disponible');
    }
    const until = new Date(now.getTime() + (SLOT_DAYS + 1) * 86_400_000);
    const booked = await this.prisma.presenteRequest.findMany({
      where: {
        status: { in: ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] },
        scheduledFor: { gte: now, lte: until },
        quotes: { some: { providerId, status: 'ACCEPTED' } },
      },
      select: { scheduledFor: true },
    });
    const availability = readAvailability(provider.availability);
    return {
      availability,
      slots: appointmentSlots(
        availability,
        booked.flatMap((r) => (r.scheduledFor ? [r.scheduledFor] : [])),
        now,
      ),
    };
  }

  // ---------- Buscar quién lo hace ----------

  /**
   * Personas y negocios verificados que ofrecen ese oficio y llegan a ese municipio (según su
   * rango de km). Se ven también los Ausentes, para conocerlos y pedirles en su horario.
   */
  async search(auth: AuthContext, dto: SearchProvidersDto, now = new Date()) {
    if (!findMunicipality(dto.municipalityCode)) {
      throw new BadRequestException('Elige un municipio de la lista');
    }
    const providers = await this.prisma.presenteProvider.findMany({
      where: { status: 'VERIFIED', trades: { has: dto.trade } },
      take: 500,
    });
    const reachable = providers
      .filter((p) => p.userId !== auth.user.id && !isSuspended(p, now))
      .map((p) => ({
        provider: p,
        km: p.municipalityCode
          ? municipalityDistanceKm(p.municipalityCode, dto.municipalityCode)
          : null,
      }))
      .filter(
        (item): item is { provider: (typeof providers)[number]; km: number } =>
          item.km !== null && item.km <= item.provider.radiusKm,
      );
    const ratings = await this.ratings(reachable.map((i) => i.provider.userId));
    return reachable
      .map(({ provider, km }) => {
        const availability = readAvailability(provider.availability);
        const present = effectivePresence(provider, now) === 'PRESENT';
        return {
          id: provider.id,
          displayName: provider.displayName,
          businessName: provider.businessName,
          isBusiness: provider.isBusiness,
          delivers: provider.delivers,
          teaches: provider.teaches,
          bio: provider.bio,
          trades: provider.trades,
          municipalityName: municipalityName(provider.municipalityCode),
          distanceKm: Math.round(km),
          present,
          // Presente = disponible ahora, aunque sea fuera de su horario (un día extra).
          availableNow: present,
          availability,
          rating: ratings.get(provider.userId) ?? { average: null, count: 0 },
        };
      })
      .sort(
        (a, b) =>
          Number(b.availableNow) - Number(a.availableNow) ||
          a.distanceKm - b.distanceKm ||
          (b.rating.average ?? 0) - (a.rating.average ?? 0),
      )
      .slice(0, 40);
  }

  /**
   * Qué servicios tienen gente verificada que llega a tu municipio (y cuántos están Presentes
   * ahora), para mostrar con color lo que hay y en tenue lo que todavía no. Solo cuenta números.
   */
  async activity(municipalityCode?: string, now = new Date()) {
    const code =
      municipalityCode && findMunicipality(municipalityCode)
        ? municipalityCode
        : null;
    const providers = await this.prisma.presenteProvider.findMany({
      where: { status: 'VERIFIED' },
      select: {
        status: true,
        trades: true,
        municipalityCode: true,
        radiusKm: true,
        presence: true,
        lastSeenAt: true,
        suspendedUntil: true,
      },
      take: 5000,
    });
    const result: Record<string, { verified: number; present: number }> = {};
    for (const p of providers) {
      if (isSuspended(p, now)) continue;
      if (code) {
        const km = p.municipalityCode
          ? municipalityDistanceKm(p.municipalityCode, code)
          : null;
        if (km === null || km > p.radiusKm) continue;
      }
      const present = effectivePresence(p, now) === 'PRESENT';
      for (const trade of p.trades) {
        const row = (result[trade] ??= { verified: 0, present: 0 });
        row.verified += 1;
        if (present) row.present += 1;
      }
    }
    return result;
  }

  // ---------- Trabajadores de confianza ----------

  async favorites(auth: AuthContext) {
    const rows = await this.prisma.presenteFavorite.findMany({
      where: { clientUserId: auth.user.id },
      include: { provider: true },
      orderBy: { createdAt: 'desc' },
    });
    const visible = rows.filter((r) => r.provider.status === 'VERIFIED');
    const now = new Date();
    const [ratings, busy] = await Promise.all([
      this.ratings(visible.map((r) => r.provider.userId)),
      this.busyByProvider(
        visible.map((r) => r.providerId),
        now,
      ),
    ]);
    return visible.map(({ provider }) => ({
      id: provider.id,
      displayName: provider.displayName,
      bio: provider.bio,
      trades: provider.trades,
      municipalityName: municipalityName(provider.municipalityCode),
      availability: readAvailability(provider.availability),
      rating: ratings.get(provider.userId) ?? { average: null, count: 0 },
      presentNow: effectivePresence(provider, now) === 'PRESENT',
      busyUntil: busy.get(provider.id) ?? null,
      takingRequests: !isSuspended(provider, now),
    }));
  }

  async addFavorite(auth: AuthContext, providerId: string) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: providerId },
    });
    if (
      !provider ||
      provider.status !== 'VERIFIED' ||
      provider.userId === auth.user.id
    ) {
      throw new NotFoundException('Trabajador no encontrado');
    }
    await this.prisma.presenteFavorite.upsert({
      where: {
        clientUserId_providerId: { clientUserId: auth.user.id, providerId },
      },
      create: { clientUserId: auth.user.id, providerId },
      update: {},
    });
    return this.favorites(auth);
  }

  async removeFavorite(auth: AuthContext, providerId: string) {
    await this.prisma.presenteFavorite.deleteMany({
      where: { clientUserId: auth.user.id, providerId },
    });
    return this.favorites(auth);
  }
}
