import { createHmac } from 'node:crypto';

import { distanceKm } from './geo/municipios';
import {
  CANCEL_FEE_MAX_MXN,
  CANCEL_FEE_MAX_PCT,
  CANCEL_FEE_MIN_MXN,
  CANCEL_FEE_PER_KM_MXN,
  CITY_SPEED_KMH,
  FREE_CANCEL_MINUTES,
  LATE_FREE_MINUTES,
  STRIKE_LIMIT,
  SUSPENSION_DAYS,
} from './presente.constants';

/** Qué puede hacer el trabajador en cada etapa. */
const NEXT: Record<string, string[]> = {
  ASSIGNED: ['EN_ROUTE'],
  EN_ROUTE: ['EN_ROUTE', 'ARRIVED'],
  ARRIVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
};

export function canMove(from: string, to: string) {
  return (NEXT[from] ?? []).includes(to);
}

/** Etapas en las que el trabajo está activo (ni abierto, ni cerrado). */
export const ACTIVE_JOB = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
export const isActiveJob = (status: string) => ACTIVE_JOB.includes(status);

function pinSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.YALIKA_PIN_SECRET ?? env.JWT_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('Falta YALIKA_PIN_SECRET para los PIN de llegada');
  }
  return 'yalika-clave-local-solo-para-desarrollo';
}

/** PIN de 4 dígitos del trabajo: se calcula, no se guarda. Lo ve el cliente y se lo dice al trabajador. */
export function arrivalPin(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const digest = createHmac('sha256', pinSecret(env))
    .update(`presente-arrival:${requestId}`)
    .digest();
  return String(1000 + (digest.readUInt32BE(0) % 9000));
}

/**
 * Cuánto le falta según su GPS: km en línea recta a la casa y minutos aproximados a velocidad
 * de ciudad, sin contar tráfico.
 */
export function gpsEta(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const km = distanceKm(from, to);
  return {
    km: Math.round(km * 10) / 10,
    minutes: Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60)),
  };
}

/** Metros entre dos puntos. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  return Math.round(distanceKm(a, b) * 1000);
}

type Point = { lat: number; lng: number };

export type CancelFee = {
  amountMxn: number;
  /** Kilómetros que avanzó hacia la casa (en línea recta). */
  advancedKm: number;
  /** Por qué: no ha salido, recién lo eligió, va tarde, va en camino o ya llegó. */
  why: 'NOT_LEFT' | 'GRACE' | 'LATE' | 'ON_THE_WAY' | 'ARRIVED';
};

/** Tope de la cuota: el 25% del precio acordado, nunca más de $250 ni menos del mínimo. */
export function cancelFeeCap(priceMxn: number) {
  return Math.max(
    CANCEL_FEE_MIN_MXN,
    Math.min(
      CANCEL_FEE_MAX_MXN,
      Math.round((priceMxn * CANCEL_FEE_MAX_PCT) / 100),
    ),
  );
}

/**
 * Cuota cuando cancela quien pidió ayuda:
 * - Gratis si nadie ha salido: pedido abierto, o elegido pero sin "voy en camino".
 * - Gratis en los primeros minutos después de elegir (por si se equivocó).
 * - Gratis si el trabajador va más de 20 minutos tarde de lo que dijo.
 * - En camino: $15 por km avanzado hacia la casa, mínimo $40, con tope (25% del precio, máx. $250).
 * - Ya llegó: el tope.
 */
export function clientCancelFee(
  input: {
    status: string;
    closedAt?: Date | string | null;
    etaAt?: Date | string | null;
    priceMxn: number;
    home?: Point | null;
    start?: Point | null;
    last?: Point | null;
  },
  now = new Date(),
): CancelFee {
  const free = (why: CancelFee['why']): CancelFee => ({
    amountMxn: 0,
    advancedKm: 0,
    why,
  });
  if (!['EN_ROUTE', 'ARRIVED'].includes(input.status)) return free('NOT_LEFT');
  const chosenAt = input.closedAt ? new Date(input.closedAt).getTime() : 0;
  if (chosenAt && now.getTime() - chosenAt <= FREE_CANCEL_MINUTES * 60_000)
    return free('GRACE');
  const cap = cancelFeeCap(input.priceMxn);
  if (input.status === 'ARRIVED')
    return { amountMxn: cap, advancedKm: 0, why: 'ARRIVED' };
  const etaAt = input.etaAt ? new Date(input.etaAt).getTime() : 0;
  if (etaAt && now.getTime() > etaAt + LATE_FREE_MINUTES * 60_000)
    return free('LATE');
  const { home, start, last } = input;
  const advancedKm =
    home && start && last
      ? Math.max(0, distanceKm(start, home) - distanceKm(last, home))
      : 0;
  const byKm = Math.round((advancedKm * CANCEL_FEE_PER_KM_MXN) / 5) * 5;
  return {
    amountMxn: Math.min(cap, Math.max(CANCEL_FEE_MIN_MXN, byKm)),
    advancedKm: Math.round(advancedKm * 10) / 10,
    why: 'ON_THE_WAY',
  };
}

/** Con más de STRIKE_LIMIT faltas en la ventana, baja temporal hasta esta fecha. */
export function suspensionAfterStrikes(
  strikesInWindow: number,
  now = new Date(),
) {
  return strikesInWindow > STRIKE_LIMIT
    ? new Date(now.getTime() + SUSPENSION_DAYS * 86_400_000)
    : null;
}

export function isSuspended(
  provider: { suspendedUntil?: Date | string | null },
  now = new Date(),
) {
  return Boolean(
    provider.suspendedUntil &&
    new Date(provider.suspendedUntil).getTime() > now.getTime(),
  );
}

/**
 * Hora aproximada en que el trabajador queda libre según su trabajo activo:
 * trabajando = inicio + duración; en camino = llegada + duración que ofreció.
 */
export function busyUntil(
  job: {
    status: string;
    startedAt?: Date | string | null;
    estimatedMinutes?: number | null;
    etaAt?: Date | string | null;
  },
  quoteDurationMinutes: number | null | undefined,
  now = new Date(),
) {
  const plus = (base: Date | string, minutes: number) =>
    new Date(new Date(base).getTime() + minutes * 60_000);
  let until: Date | null = null;
  if (job.status === 'IN_PROGRESS' && job.startedAt) {
    until = plus(
      job.startedAt,
      job.estimatedMinutes ?? quoteDurationMinutes ?? 60,
    );
  } else if (['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(job.status)) {
    until = plus(job.etaAt ?? now, quoteDurationMinutes ?? 60);
  }
  return until && until.getTime() > now.getTime() ? until : null;
}

// ---------- Horario, salud y avisos ----------

type AvailabilityLike = {
  days: number[];
  allDay: boolean;
  from: string | null;
  to: string | null;
};

const MX_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Mexico_City',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Día (1 = lunes) y hora "HH:MM" en hora del centro de México. */
export function mexicoDayTime(date: Date) {
  const parts = Object.fromEntries(
    MX_TIME.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    day: WEEKDAY[parts.weekday] ?? 1,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * ¿El trabajador atiende en esa fecha y hora? Considera turnos de noche
 * (por ejemplo 22:00 a 06:00: la madrugada cuenta como parte del día anterior).
 */
export function isWithinAvailability(
  availability: AvailabilityLike | null,
  date: Date,
) {
  if (!availability || !availability.days.length) return false;
  const { day, time } = mexicoDayTime(date);
  if (availability.allDay || !availability.from || !availability.to) {
    return availability.days.includes(day);
  }
  const { from, to } = availability;
  if (from < to)
    return availability.days.includes(day) && time >= from && time < to;
  const previous = day === 1 ? 7 : day - 1;
  return (
    (availability.days.includes(day) && time >= from) ||
    (availability.days.includes(previous) && time < to)
  );
}

/** «martes 22 de octubre, 10:00 a.m.» en hora de México. */
export function visitLabel(date: Date) {
  return date.toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

/** Citas: horarios que se ofrecen (cada hora), cuántos días adelante y el espacio entre citas. */
export const SLOT_DAYS = 7;
export const SLOT_MIN_AHEAD_MINUTES = 60;
export const SLOT_GAP_MINUTES = 90;
/** Si atiende las 24 horas, las citas se ofrecen de 7:00 a 20:00 (no de madrugada). */
const ALL_DAY_FROM = '07:00';
const ALL_DAY_TO = '21:00';

/**
 * Horarios libres para pedirle cita a alguien: cada hora dentro de su horario, desde una hora
 * adelante y hasta 7 días, sin chocar con sus citas ya aceptadas.
 */
export function appointmentSlots(
  availability: AvailabilityLike | null,
  busy: Date[],
  now = new Date(),
  days = SLOT_DAYS,
) {
  if (!availability || !availability.days.length) return [];
  const slots: Date[] = [];
  const start = new Date(now.getTime() + SLOT_MIN_AHEAD_MINUTES * 60_000);
  start.setUTCMinutes(0, 0, 0);
  start.setTime(start.getTime() + 3_600_000);
  const end = now.getTime() + days * 86_400_000;
  for (let t = start.getTime(); t <= end; t += 3_600_000) {
    const at = new Date(t);
    if (!isWithinAvailability(availability, at)) continue;
    if (availability.allDay || !availability.from || !availability.to) {
      const { time } = mexicoDayTime(at);
      if (time < ALL_DAY_FROM || time >= ALL_DAY_TO) continue;
    }
    const clash = busy.some(
      (b) => Math.abs(b.getTime() - t) < SLOT_GAP_MINUTES * 60_000,
    );
    if (!clash) slots.push(at);
  }
  return slots;
}

/** Trabajo de salud: enlaza con el módulo de Salud o de Veterinaria (cada uno revalida sus permisos). */
export function careLink(trades: readonly string[]): 'HEALTH' | 'VET' | null {
  if (trades.some((t) => t === 'MEDICO' || t === 'ENFERMERIA')) return 'HEALTH';
  if (trades.includes('VETERINARIO')) return 'VET';
  return null;
}

/** ¿El mensaje trae un número de teléfono? (10 dígitos o más, con o sin espacios o guiones). */
export function containsPhone(text: string) {
  return /(?:\d[\s.-]?){10,}/.test(text);
}
