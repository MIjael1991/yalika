/**
 * Llamadas dentro de Tequio (voz por internet, sin mostrar números). Aquí solo van las reglas:
 * cuándo se puede llamar, cuánto timbra y cuánto dura como máximo.
 */

/** Segundos que timbra antes de contar como llamada perdida. */
export const CALL_RING_SECONDS = 45;
/** Duración máxima de una llamada. */
export const CALL_MAX_MINUTES = 30;
/** Después de terminar el trabajo todavía se pueden llamar este tiempo (dudas, factura). */
export const CALL_AFTER_FINISH_HOURS = 48;

const LIVE_JOB = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

export type CallStatus =
  'RINGING' | 'ACCEPTED' | 'ENDED' | 'MISSED' | 'DECLINED';

/** Solo con trabajador elegido y el trabajo vivo, o recién terminado. */
export function canCall(
  request: {
    status: string;
    chosenQuoteId: string | null;
    finishedAt: Date | null;
  },
  now = new Date(),
) {
  if (!request.chosenQuoteId) return false;
  if (LIVE_JOB.includes(request.status)) return true;
  return (
    request.status === 'COMPLETED' &&
    request.finishedAt !== null &&
    now.getTime() - request.finishedAt.getTime() <=
      CALL_AFTER_FINISH_HOURS * 3_600_000
  );
}

/** Estado real: una llamada que nadie contestó o que pasó del máximo se da por terminada. */
export function effectiveCallStatus(
  call: { status: string; createdAt: Date; answeredAt: Date | null },
  now = new Date(),
): CallStatus {
  if (
    call.status === 'RINGING' &&
    now.getTime() - call.createdAt.getTime() > CALL_RING_SECONDS * 1000
  ) {
    return 'MISSED';
  }
  if (
    call.status === 'ACCEPTED' &&
    call.answeredAt &&
    now.getTime() - call.answeredAt.getTime() > CALL_MAX_MINUTES * 60_000
  ) {
    return 'ENDED';
  }
  return call.status as CallStatus;
}

/** Texto que queda en el chat. */
export function callSummary(input: {
  outcome: 'ENDED' | 'MISSED' | 'DECLINED';
  callerName: string;
  answeredAt: Date | null;
  endedAt: Date;
}) {
  if (input.outcome !== 'ENDED' || !input.answeredAt) {
    return {
      minutes: 0,
      text: `Llamada perdida de ${input.callerName}`,
    };
  }
  const seconds = Math.max(
    0,
    (input.endedAt.getTime() - input.answeredAt.getTime()) / 1000,
  );
  const minutes = Math.round(seconds / 60);
  return {
    minutes,
    text:
      minutes < 1
        ? 'Llamada de menos de 1 minuto'
        : `Llamada de ${minutes} min`,
  };
}

/** Servidores para conectar la voz. STUN gratuito; TURN opcional para redes difíciles. */
export function iceServers(env: NodeJS.ProcessEnv = process.env) {
  const servers: { urls: string[]; username?: string; credential?: string }[] =
    [{ urls: ['stun:stun.l.google.com:19302'] }];
  const turn = (env.PRESENTE_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u));
  if (
    turn.length &&
    env.PRESENTE_TURN_USERNAME &&
    env.PRESENTE_TURN_CREDENTIAL
  ) {
    servers.push({
      urls: turn,
      username: env.PRESENTE_TURN_USERNAME,
      credential: env.PRESENTE_TURN_CREDENTIAL,
    });
  }
  return servers;
}
