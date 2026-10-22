import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { findMunicipality } from './geo/municipios';
import { PresenteJobsService } from './presente-jobs.service';
import {
  jobEndedAt,
  safetyKeepDays,
  USER_RECORD_DAYS,
  userRecordOpen,
  userRecordUntil,
} from './presente-safety.domain';
import { PresenteStorageService } from './presente-storage.service';

const OUTCOME: Record<string, string> = {
  ENDED: 'contestada',
  MISSED: 'no contestó',
  DECLINED: 'rechazada',
  ACCEPTED: 'en curso',
  RINGING: 'timbrando',
};

/**
 * Sábana de seguridad de un trabajo: quién, cuándo, qué se dijeron, llamadas y grabaciones.
 * Los dos la descargan durante 30 días; después queda sellada: solo una persona de Yalika la
 * abre con el número de oficio de una autoridad, y queda registrado. Se borra al cumplir el
 * plazo de resguardo.
 */
@Injectable()
export class PresenteSafetyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenteSafetyService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: PresenteJobsService,
    private readonly storage: PresenteStorageService,
  ) {}

  onModuleInit() {
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), 12 * 3_600_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async forParticipant(auth: AuthContext, requestId: string) {
    const { request } = await this.jobs.requireParticipant(auth, requestId);
    if (!userRecordOpen(request)) {
      throw new ConflictException(
        'Pasaron 30 días: este registro quedó sellado. Solo se entrega con orden de una autoridad.',
      );
    }
    return this.build(requestId, false);
  }

  /** Operador: abre el registro sellado con el oficio de una autoridad (queda en la bitácora). */
  async forAuthority(
    operatorUserId: string,
    requestId: string,
    authorityRef: string,
  ) {
    const ref = authorityRef.trim();
    if (ref.length < 4) {
      throw new BadRequestException(
        'Escribe el número de oficio u orden de la autoridad',
      );
    }
    const id = await this.resolveId(requestId);
    const record = await this.build(id, true);
    await this.prisma.presenteAuditEvent.create({
      data: {
        providerId: record.worker?.providerId ?? null,
        actorUserId: operatorUserId,
        action: 'SAFETY_RECORD_OPENED',
        metadata: { requestId: id, authorityRef: ref },
      },
    });
    return record;
  }

  /** El número de pedido que sale en la sábana son los primeros 8 caracteres. */
  private async resolveId(value: string) {
    const code = value.trim().toLowerCase();
    if (/^[0-9a-f-]{36}$/.test(code)) return code;
    if (!/^[0-9a-f]{8}$/.test(code)) {
      throw new BadRequestException(
        'Escribe el número de pedido (8 letras y números) como sale en el registro',
      );
    }
    const found = await this.prisma.presenteRequest.findMany({
      where: { id: { startsWith: code } },
      select: { id: true },
      take: 2,
    });
    if (found.length !== 1) throw new NotFoundException('Pedido no encontrado');
    return found[0].id;
  }

  /** Operador: una grabación del registro sellado (también queda en la bitácora). */
  async authorityRecording(
    operatorUserId: string,
    requestId: string,
    recordingId: string,
    authorityRef: string,
  ) {
    const ref = authorityRef.trim();
    if (ref.length < 4) {
      throw new BadRequestException(
        'Escribe el número de oficio u orden de la autoridad',
      );
    }
    const recording = await this.prisma.presenteCallRecording.findUnique({
      where: { id: recordingId },
    });
    if (!recording || recording.requestId !== requestId) {
      throw new NotFoundException('Grabación no encontrada');
    }
    await this.prisma.presenteAuditEvent.create({
      data: {
        actorUserId: operatorUserId,
        action: 'SAFETY_RECORDING_OPENED',
        metadata: { requestId, recordingId, authorityRef: ref },
      },
    });
    const bytes = await this.storage.get(recording.storageKey);
    return {
      mime: recording.mime,
      seconds: recording.seconds,
      dataUrl: `data:${recording.mime};base64,${bytes.toString('base64')}`,
    };
  }

  private async build(requestId: string, sealed: boolean) {
    const { request, chosen } = await this.jobs.loadJob(requestId);
    const [client, messages, calls, recordings] = await Promise.all([
      this.prisma.presenteClient.findUnique({
        where: { userId: request.clientUserId },
        select: { displayName: true },
      }),
      this.prisma.presenteMessage.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.presenteCall.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.presenteCallRecording.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const worker = chosen?.provider ?? null;
    const workerName = worker
      ? worker.businessName || worker.displayName
      : null;
    const clientName = client?.displayName ?? 'Cliente';
    const nameOf = (userId: string) =>
      userId === request.clientUserId
        ? clientName
        : worker && userId === worker.userId
          ? (workerName ?? 'Trabajador')
          : 'Otra persona';
    const timeline = (
      [
        [request.createdAt, `${clientName} pidió el servicio`],
        [request.scheduledFor, 'Hora de la cita'],
        [request.closedAt, workerName ? `Eligió a ${workerName}` : null],
        [request.enRouteAt, 'Salió en camino'],
        [request.arrivedAt, 'Llegó (confirmado con el PIN del cliente)'],
        [request.startedAt, 'Empezó el trabajo'],
        [request.finishedAt, 'Terminó el trabajo'],
        [request.clientConfirmedAt, 'El cliente confirmó que quedó bien'],
        [request.problemAt, 'Se reportó un problema'],
        [
          request.status === 'CANCELLED' ? request.updatedAt : null,
          `Se canceló${request.cancelReason ? `: ${request.cancelReason}` : ''}`,
        ],
      ] as [Date | null, string | null][]
    )
      .filter((item): item is [Date, string] => Boolean(item[0] && item[1]))
      .sort((a, b) => a[0].getTime() - b[0].getTime())
      .map(([at, label]) => ({ at, label }));

    return {
      requestId: request.id,
      sealed,
      generatedAt: new Date(),
      availableUntil: userRecordUntil(request),
      userDays: USER_RECORD_DAYS,
      keepDays: safetyKeepDays(),
      trades: request.trades,
      description: request.description,
      place: {
        municipality: findMunicipality(request.municipalityCode)?.name ?? null,
        label: request.placeLabel,
        hint: request.addressHint,
      },
      status: request.status,
      client: { name: clientName },
      worker: worker
        ? {
            providerId: worker.id,
            name: workerName,
            person: worker.displayName,
            verified: worker.status === 'VERIFIED',
          }
        : null,
      price: chosen
        ? { quotedMxn: chosen.amountMxn, finalMxn: request.finalAmountMxn }
        : null,
      timeline,
      messages: messages.map((m) => ({
        at: m.createdAt,
        from: m.senderRole === 'SYSTEM' ? 'Tequio' : nameOf(m.senderUserId),
        system: m.senderRole === 'SYSTEM',
        body: m.body,
      })),
      calls: calls.map((c) => ({
        at: c.createdAt,
        from: nameOf(c.callerUserId),
        to: nameOf(c.calleeUserId),
        outcome: OUTCOME[c.status] ?? c.status,
        minutes:
          c.answeredAt && c.endedAt
            ? Math.round(
                (c.endedAt.getTime() - c.answeredAt.getTime()) / 60_000,
              )
            : 0,
      })),
      recordings: recordings.map((r) => ({
        id: r.id,
        at: r.createdAt,
        by: nameOf(r.recordedByUserId),
        seconds: r.seconds,
      })),
    };
  }

  /**
   * Borra lo que ya cumplió el plazo de resguardo (por defecto 1 año después de terminar):
   * mensajes, recorrido, llamadas y grabaciones. Lo de trabajos en curso no se toca.
   */
  async cleanup(now = new Date()) {
    const before = new Date(now.getTime() - safetyKeepDays() * 86_400_000);
    try {
      const old = await this.prisma.presenteRequest.findMany({
        where: {
          updatedAt: { lt: before },
          status: { in: ['COMPLETED', 'CANCELLED', 'OPEN'] },
          OR: [{ messages: { some: {} } }, { trackPoints: { some: {} } }],
        },
        select: {
          id: true,
          status: true,
          finishedAt: true,
          updatedAt: true,
          expiresAt: true,
        },
        take: 500,
      });
      const ids = old
        .filter((r) => {
          const ended = jobEndedAt(r);
          return ended !== null && ended < before;
        })
        .map((r) => r.id);
      const recordings = await this.prisma.presenteCallRecording.findMany({
        where: {
          OR: [{ requestId: { in: ids } }, { createdAt: { lt: before } }],
        },
      });
      for (const recording of recordings) {
        await this.storage.delete(recording.storageKey);
      }
      const [points, messages, calls, recs] = await this.prisma.$transaction([
        this.prisma.presenteTrackPoint.deleteMany({
          where: { requestId: { in: ids } },
        }),
        this.prisma.presenteMessage.deleteMany({
          where: { requestId: { in: ids } },
        }),
        this.prisma.presenteCall.deleteMany({
          where: {
            OR: [{ requestId: { in: ids } }, { createdAt: { lt: before } }],
          },
        }),
        this.prisma.presenteCallRecording.deleteMany({
          where: { id: { in: recordings.map((r) => r.id) } },
        }),
      ]);
      if (points.count || messages.count || calls.count || recs.count) {
        this.logger.log(
          `Resguardo vencido: ${messages.count} mensajes, ${points.count} puntos, ${calls.count} llamadas y ${recs.count} grabaciones.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo limpiar el resguardo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
