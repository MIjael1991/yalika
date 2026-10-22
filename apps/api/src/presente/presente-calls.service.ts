import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CALL_MAX_MINUTES,
  CALL_RING_SECONDS,
  callSummary,
  canCall,
  effectiveCallStatus,
  iceServers,
} from './presente-call.domain';
import { PresenteJobsService } from './presente-jobs.service';
import { PresentePushService } from './presente-push.service';
import { readAudioDataUrl, userRecordOpen } from './presente-safety.domain';
import { PresenteStorageService } from './presente-storage.service';

type CallRow = {
  id: string;
  requestId: string;
  callerUserId: string;
  calleeUserId: string;
  status: string;
  offerSdp: string;
  answerSdp: string | null;
  recordingByUserId: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
};

/**
 * Llamadas de voz entre cliente y trabajador sin mostrar números. El servidor solo pasa los
 * datos para que los dos teléfonos se conecten directo (WebRTC); la voz no pasa por aquí. Solo
 * se guarda una grabación si uno toca «Grabar» (al otro se le avisa).
 */
@Injectable()
export class PresenteCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: PresenteJobsService,
    private readonly push: PresentePushService,
    private readonly storage: PresenteStorageService,
  ) {}

  config() {
    return {
      iceServers: iceServers(),
      ringSeconds: CALL_RING_SECONDS,
      maxMinutes: CALL_MAX_MINUTES,
    };
  }

  async start(auth: AuthContext, requestId: string, offerSdp: string) {
    const job = await this.jobs.requireParticipant(auth, requestId);
    const { request, role, chosen } = job;
    if (!chosen || !canCall(request)) {
      throw new ConflictException(
        'Las llamadas se abren cuando eliges a un trabajador y hasta 2 días después de terminar',
      );
    }
    const live = await this.liveCall(requestId);
    if (live?.status === 'ACCEPTED') {
      throw new ConflictException('Ya están en una llamada');
    }
    if (live && live.calleeUserId === auth.user.id) {
      throw new ConflictException('Te están llamando: contesta la llamada');
    }
    if (live) await this.finish(live, 'MISSED');

    const calleeUserId =
      role === 'CLIENT' ? chosen.provider.userId : request.clientUserId;
    const call = await this.prisma.presenteCall.create({
      data: {
        requestId,
        callerUserId: auth.user.id,
        calleeUserId,
        offerSdp,
      },
    });
    const name = await this.nameOf(job, auth.user.id);
    void this.push.notify([calleeUserId], {
      title: `${name} te está llamando`,
      body: 'Llamada por Tequio. Toca para contestar.',
      url:
        role === 'CLIENT' ? '/tequio/trabajo' : `/tequio/pedido/${requestId}`,
      tag: `llamada-${requestId}`,
    });
    return this.view(call, auth.user.id, job);
  }

  /** La llamada en curso o timbrando de este pedido (para mostrar "te están llamando"). */
  async current(auth: AuthContext, requestId: string) {
    const job = await this.jobs.requireParticipant(auth, requestId);
    const live = await this.liveCall(requestId);
    return live ? this.view(live, auth.user.id, job) : null;
  }

  async get(auth: AuthContext, callId: string) {
    const { call, job } = await this.mine(auth, callId);
    return this.view(await this.settle(call), auth.user.id, job);
  }

  async answer(auth: AuthContext, callId: string, answerSdp: string) {
    const { call, job } = await this.mine(auth, callId);
    if (call.calleeUserId !== auth.user.id) {
      throw new ConflictException('Esta llamada la hiciste tú');
    }
    const settled = await this.settle(call);
    if (settled.status !== 'RINGING') {
      throw new ConflictException('La llamada ya terminó');
    }
    const moved = await this.prisma.presenteCall.updateMany({
      where: { id: callId, status: 'RINGING' },
      data: { status: 'ACCEPTED', answerSdp, answeredAt: new Date() },
    });
    if (!moved.count) throw new ConflictException('La llamada ya terminó');
    const fresh = await this.prisma.presenteCall.findUniqueOrThrow({
      where: { id: callId },
    });
    return this.view(fresh, auth.user.id, job);
  }

  /** Colgar: si nadie había contestado cuenta como rechazada (o cancelada por quien llamó). */
  async end(auth: AuthContext, callId: string) {
    const { call, job } = await this.mine(auth, callId);
    const settled = await this.settle(call);
    if (settled.status === 'RINGING') {
      await this.finish(
        settled,
        settled.calleeUserId === auth.user.id ? 'DECLINED' : 'MISSED',
      );
    } else if (settled.status === 'ACCEPTED') {
      await this.finish(settled, 'ENDED');
    }
    const fresh = await this.prisma.presenteCall.findUniqueOrThrow({
      where: { id: callId },
    });
    return this.view(fresh, auth.user.id, job);
  }

  // ---------- Grabar (con aviso al otro) ----------

  /** Empieza a grabar: al otro le sale «está grabando» y queda escrito en el chat. */
  async startRecording(auth: AuthContext, callId: string) {
    const { call, job } = await this.mine(auth, callId);
    const settled = await this.settle(call);
    if (settled.status !== 'ACCEPTED') {
      throw new ConflictException('Solo se graba una llamada en curso');
    }
    if (
      settled.recordingByUserId &&
      settled.recordingByUserId !== auth.user.id
    ) {
      throw new ConflictException(
        'La otra persona ya está grabando esta llamada',
      );
    }
    if (!settled.recordingByUserId) {
      await this.prisma.presenteCall.update({
        where: { id: callId },
        data: { recordingByUserId: auth.user.id },
      });
      await this.prisma.presenteMessage.create({
        data: {
          requestId: call.requestId,
          senderUserId: auth.user.id,
          senderRole: 'SYSTEM',
          kind: 'RECORDING',
          meta: { callId, event: 'START' },
          body: `${await this.nameOf(job, auth.user.id)} empezó a grabar la llamada. La grabación queda para los dos.`,
        },
      });
    }
    return this.get(auth, callId);
  }

  /** Guarda la grabación (al colgar o al detenerla). La escuchan y descargan los dos. */
  async saveRecording(
    auth: AuthContext,
    callId: string,
    dataUrl: string,
    seconds: number,
  ) {
    const { call, job } = await this.mine(auth, callId);
    const recent =
      call.status === 'ACCEPTED' ||
      (call.endedAt !== null &&
        Date.now() - call.endedAt.getTime() < 15 * 60_000);
    if (!call.answeredAt || !recent) {
      throw new ConflictException('Esa llamada ya no se puede guardar');
    }
    const audio = readAudioDataUrl(dataUrl);
    if (!audio) {
      throw new BadRequestException(
        'La grabación no se pudo leer o pesa demasiado',
      );
    }
    const key = this.storage.newKey(call.requestId, 'grabacion');
    await this.storage.put(key, audio.bytes);
    const recording = await this.prisma.presenteCallRecording.create({
      data: {
        callId,
        requestId: call.requestId,
        recordedByUserId: auth.user.id,
        mime: audio.mime,
        storageKey: key,
        seconds: Math.max(0, Math.min(60 * 60, Math.round(seconds))),
      },
    });
    await this.prisma.presenteCall.updateMany({
      where: { id: callId, recordingByUserId: auth.user.id },
      data: { recordingByUserId: null },
    });
    const minutes = Math.max(1, Math.round(recording.seconds / 60));
    await this.prisma.presenteMessage.create({
      data: {
        requestId: call.requestId,
        senderUserId: auth.user.id,
        senderRole: 'SYSTEM',
        kind: 'RECORDING',
        meta: { callId, event: 'SAVED', recordingId: recording.id },
        body: `Grabación de la llamada (${minutes} min) que hizo ${await this.nameOf(job, auth.user.id)}. Disponible 30 días para los dos.`,
      },
    });
    return { id: recording.id, seconds: recording.seconds };
  }

  /** Escuchar o descargar una grabación (solo los dos del trabajo, durante 30 días). */
  async recording(auth: AuthContext, requestId: string, recordingId: string) {
    const { request } = await this.jobs.requireParticipant(auth, requestId);
    const recording = await this.prisma.presenteCallRecording.findUnique({
      where: { id: recordingId },
    });
    if (!recording || recording.requestId !== requestId) {
      throw new NotFoundException('Grabación no encontrada');
    }
    if (!userRecordOpen(request)) {
      throw new ConflictException(
        'Pasaron 30 días: la grabación quedó sellada y solo se entrega con orden de una autoridad',
      );
    }
    const bytes = await this.storage.get(recording.storageKey);
    return {
      mime: recording.mime,
      seconds: recording.seconds,
      dataUrl: `data:${recording.mime};base64,${bytes.toString('base64')}`,
    };
  }

  // ---------- Internos ----------

  private async mine(auth: AuthContext, callId: string) {
    const call = await this.prisma.presenteCall.findUnique({
      where: { id: callId },
    });
    if (
      !call ||
      (call.callerUserId !== auth.user.id && call.calleeUserId !== auth.user.id)
    ) {
      throw new NotFoundException('Llamada no encontrada');
    }
    const job = await this.jobs.requireParticipant(auth, call.requestId);
    return { call, job };
  }

  /** La última llamada viva del pedido; las vencidas se cierran al pasar. */
  private async liveCall(requestId: string) {
    const calls = await this.prisma.presenteCall.findMany({
      where: { requestId, status: { in: ['RINGING', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
    });
    let live: CallRow | null = null;
    for (const call of calls) {
      const settled = await this.settle(call);
      if (!live && ['RINGING', 'ACCEPTED'].includes(settled.status)) {
        live = settled;
      }
    }
    return live;
  }

  private async settle(call: CallRow): Promise<CallRow> {
    const status = effectiveCallStatus(call);
    if (status === call.status) return call;
    await this.finish(call, status as 'ENDED' | 'MISSED');
    return this.prisma.presenteCall.findUniqueOrThrow({
      where: { id: call.id },
    });
  }

  /** Cierra la llamada una sola vez y deja constancia en el chat. */
  private async finish(
    call: CallRow,
    outcome: 'ENDED' | 'MISSED' | 'DECLINED',
  ) {
    const endedAt =
      outcome === 'ENDED' && call.answeredAt
        ? new Date(
            Math.min(
              Date.now(),
              call.answeredAt.getTime() + CALL_MAX_MINUTES * 60_000,
            ),
          )
        : new Date();
    const moved = await this.prisma.presenteCall.updateMany({
      where: { id: call.id, status: { in: ['RINGING', 'ACCEPTED'] } },
      data: { status: outcome, endedAt, recordingByUserId: null },
    });
    if (!moved.count) return;
    const job = await this.jobs.loadJob(call.requestId);
    const summary = callSummary({
      outcome,
      callerName: await this.nameOf(job, call.callerUserId),
      answeredAt: call.answeredAt,
      endedAt,
    });
    await this.prisma.presenteMessage.create({
      data: {
        requestId: call.requestId,
        senderUserId: call.callerUserId,
        senderRole: 'SYSTEM',
        kind: 'CALL',
        meta: { callId: call.id, outcome, minutes: summary.minutes },
        body: summary.text,
      },
    });
    if (outcome === 'MISSED') {
      void this.push.notify([call.calleeUserId], {
        title: summary.text,
        body: 'Puedes regresarle la llamada desde Tequio.',
        url:
          job.request.clientUserId === call.calleeUserId
            ? `/tequio/pedido/${call.requestId}`
            : '/tequio/trabajo',
        tag: `llamada-${call.requestId}`,
      });
    }
  }

  private async nameOf(
    job: Awaited<ReturnType<PresenteJobsService['loadJob']>>,
    userId: string,
  ) {
    const worker = job.chosen?.provider;
    if (worker && worker.userId === userId) {
      return worker.businessName || worker.displayName;
    }
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId },
      select: { displayName: true },
    });
    return client?.displayName ?? 'Tu cliente';
  }

  private async view(
    call: CallRow,
    me: string,
    job: Awaited<ReturnType<PresenteJobsService['loadJob']>>,
  ) {
    const incoming = call.calleeUserId === me;
    return {
      id: call.id,
      requestId: call.requestId,
      status: effectiveCallStatus(call),
      direction: incoming ? ('IN' as const) : ('OUT' as const),
      otherName: await this.nameOf(
        job,
        incoming ? call.callerUserId : call.calleeUserId,
      ),
      // Cada quien solo recibe lo que le toca para conectar.
      offerSdp: incoming && call.status === 'RINGING' ? call.offerSdp : null,
      answerSdp: !incoming ? call.answerSdp : null,
      // Si alguien está grabando, los dos lo ven en pantalla.
      recordingBy: !call.recordingByUserId
        ? null
        : call.recordingByUserId === me
          ? ('ME' as const)
          : ('OTHER' as const),
      createdAt: call.createdAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
    };
  }
}
