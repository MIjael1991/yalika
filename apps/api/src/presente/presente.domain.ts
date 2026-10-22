import { municipalityDistanceKm } from './geo/municipios';
import {
  MAX_IMAGE_BYTES,
  MIN_IMAGE_BYTES,
  PRESENCE_TIMEOUT_MS,
  PRESENTE_DOCUMENT_KINDS,
  PRESENTE_EDITABLE_STATUSES,
  PRESENTE_MODULE,
  RECHECK_DAYS,
  RECHECK_GRACE_DAYS,
} from './presente.constants';

export function hasPresenteAccess(modules?: readonly string[] | null) {
  if (!modules?.length) return false;
  return modules.includes('all') || modules.includes(PRESENTE_MODULE);
}

export function isEditableStatus(status: string) {
  return (PRESENTE_EDITABLE_STATUSES as readonly string[]).includes(status);
}

// ---------- CURP ----------

const CURP_PATTERN =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;
const CHECK_ALPHABET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function normalizeCurp(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

/** Dígito verificador de la CURP (posición 18), calculado con los primeros 17 caracteres. */
export function curpCheckDigit(first17: string) {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const value = CHECK_ALPHABET.indexOf(first17[i]);
    if (value < 0) return null;
    sum += value * (18 - i);
  }
  const digit = 10 - (sum % 10);
  return digit === 10 ? 0 : digit;
}

export type CurpCheck =
  | { ok: true; curp: string; birthDate: Date }
  | { ok: false; reason: 'FORMAT' | 'CHECK_DIGIT' | 'BIRTH_DATE' };

/** Revisa forma, dígito verificador y fecha de nacimiento. No consulta a RENAPO. */
export function checkCurp(raw: string): CurpCheck {
  const curp = normalizeCurp(raw);
  if (!CURP_PATTERN.test(curp)) return { ok: false, reason: 'FORMAT' };
  if (curpCheckDigit(curp.slice(0, 17)) !== Number(curp[17])) {
    return { ok: false, reason: 'CHECK_DIGIT' };
  }
  const yy = Number(curp.slice(4, 6));
  const month = Number(curp.slice(6, 8));
  const day = Number(curp.slice(8, 10));
  // Posición 17: número = nacido antes de 2000; letra = 2000 en adelante.
  const year = (/\d/.test(curp[16]) ? 1900 : 2000) + yy;
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCDate() !== day) {
    return { ok: false, reason: 'BIRTH_DATE' };
  }
  return { ok: true, curp, birthDate };
}

export function ageOn(birthDate: Date, now = new Date()) {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() &&
      now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAdultOn(birthDate: Date, now = new Date()) {
  return ageOn(birthDate, now) >= 18;
}

export function maskCurp(last4?: string | null) {
  return last4 ? `**************${last4}` : null;
}

// ---------- Presencia ----------

export type PresenceLike = {
  status: string;
  presence: string;
  lastSeenAt?: Date | string | null;
  suspendedUntil?: Date | string | null;
};

/** Presente solo si está verificado, lo marcó Presente y dio señales en los últimos 30 minutos. */
export function effectivePresence(provider: PresenceLike, now = new Date()) {
  if (provider.status !== 'VERIFIED' || provider.presence !== 'PRESENT') {
    return 'ABSENT';
  }
  // De baja temporal por faltas: no recibe pedidos.
  if (
    provider.suspendedUntil &&
    new Date(provider.suspendedUntil).getTime() > now.getTime()
  ) {
    return 'ABSENT';
  }
  if (!provider.lastSeenAt) return 'ABSENT';
  const seen = new Date(provider.lastSeenAt).getTime();
  if (Number.isNaN(seen) || now.getTime() - seen > PRESENCE_TIMEOUT_MS) {
    return 'ABSENT';
  }
  return 'PRESENT';
}

// ---------- Envío a revisión ----------

export type SubmitLike = {
  displayName?: string | null;
  trades?: string[] | null;
  municipalityCode?: string | null;
  availability?: unknown;
  curpHash?: string | null;
  biometricConsentAt?: Date | string | null;
};

/** Lo que falta para poder mandar el registro a revisión. Lista vacía = completo. */
export function missingForSubmit(
  provider: SubmitLike,
  documentKinds: readonly string[],
) {
  const missing: string[] = [];
  if (!provider.displayName?.trim()) missing.push('NAME');
  if (!provider.trades?.length) missing.push('TRADES');
  if (!provider.municipalityCode) missing.push('MUNICIPALITY');
  if (!readAvailability(provider.availability)) missing.push('SCHEDULE');
  if (!provider.curpHash) missing.push('CURP');
  if (!provider.biometricConsentAt) missing.push('CONSENT');
  for (const kind of PRESENTE_DOCUMENT_KINDS) {
    if (!documentKinds.includes(kind)) missing.push(kind);
  }
  return missing;
}

// ---------- Fotos ----------

const DATA_URL =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

/** Reconoce JPG, PNG y WEBP por sus primeros bytes (no por lo que diga el navegador). */
export function detectImageMime(bytes: Buffer) {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export type ImageCheck =
  | { ok: true; bytes: Buffer; mimeType: string }
  | { ok: false; reason: 'FORMAT' | 'TOO_SMALL' | 'TOO_LARGE' };

export function parseImageDataUrl(dataUrl: string): ImageCheck {
  const match = DATA_URL.exec(dataUrl.trim());
  if (!match) return { ok: false, reason: 'FORMAT' };
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length < MIN_IMAGE_BYTES) return { ok: false, reason: 'TOO_SMALL' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'TOO_LARGE' };
  const mimeType = detectImageMime(bytes);
  if (!mimeType) return { ok: false, reason: 'FORMAT' };
  return { ok: true, bytes, mimeType };
}

/** Comprobante de la SEP de una cédula: falta, en revisión o visible para los clientes. */
export function sepProofState(c: {
  sepProofKey: string | null;
  sepProofCheckedAt: Date | null;
}): 'MISSING' | 'PENDING' | 'VERIFIED' {
  if (!c.sepProofKey) return 'MISSING';
  return c.sepProofCheckedAt ? 'VERIFIED' : 'PENDING';
}

// ---------- Pedidos ----------

export type RequestLike = {
  status: string;
  expiresAt: Date | string;
};

/** Abierto = sin elegir, sin cancelar y sin vencer. */
export function isRequestOpen(request: RequestLike, now = new Date()) {
  return (
    request.status === 'OPEN' &&
    new Date(request.expiresAt).getTime() > now.getTime()
  );
}

/** Estado para mostrar: un pedido abierto que ya venció se ve como vencido. */
export function requestStatus(request: RequestLike, now = new Date()) {
  return request.status === 'OPEN' && !isRequestOpen(request, now)
    ? 'EXPIRED'
    : request.status;
}

export type ServeProvider = PresenceLike & {
  trades: string[];
  municipalityCode?: string | null;
  radiusKm: number;
};

/**
 * Km entre el trabajador y el pedido si el trabajador lo puede atender ahora
 * (verificado, Presente, con ese oficio y dentro de su rango). Si no, null.
 */
export function serveDistanceKm(
  provider: ServeProvider,
  request: { trades: string[]; municipalityCode: string },
  now = new Date(),
) {
  if (effectivePresence(provider, now) !== 'PRESENT') return null;
  return reachKm(provider, request);
}

/**
 * Km si el pedido es de lo que sabe hacer y está dentro de su rango, esté Presente o no
 * (apagado también ve los trabajos y puede mandar su precio). Si no, null.
 */
export function reachKm(
  provider: Pick<ServeProvider, 'trades' | 'municipalityCode' | 'radiusKm'>,
  request: { trades: string[]; municipalityCode: string },
) {
  const shared = request.trades.some((trade) =>
    provider.trades.includes(trade),
  );
  if (!shared || !provider.municipalityCode) return null;
  const km = municipalityDistanceKm(
    provider.municipalityCode,
    request.municipalityCode,
  );
  return km !== null && km <= provider.radiusKm ? km : null;
}

// ---------- Días y horario ----------

/** Días 1 = lunes ... 7 = domingo. Horas "HH:MM" en hora local. */
export type Availability = {
  days: number[];
  allDay: boolean;
  from: string | null;
  to: string | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Revisa y ordena lo que manda la pantalla. Devuelve el horario o el motivo del error. */
export function buildAvailability(input: {
  days: number[];
  allDay: boolean;
  from?: string | null;
  to?: string | null;
}):
  { ok: true; value: Availability } | { ok: false; reason: 'DAYS' | 'HOURS' } {
  const days = Array.from(new Set(input.days)).filter(
    (d) => Number.isInteger(d) && d >= 1 && d <= 7,
  );
  if (!days.length) return { ok: false, reason: 'DAYS' };
  days.sort((a, b) => a - b);
  if (input.allDay)
    return { ok: true, value: { days, allDay: true, from: null, to: null } };
  const from = input.from ?? '';
  const to = input.to ?? '';
  if (!TIME.test(from) || !TIME.test(to) || from === to)
    return { ok: false, reason: 'HOURS' };
  // "22:00 a 06:00" se acepta: es un turno de noche.
  return { ok: true, value: { days, allDay: false, from, to } };
}

/** Lee lo guardado en la base; si no es válido, como si no hubiera horario. */
export function readAvailability(value: unknown): Availability | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Availability>;
  if (!Array.isArray(v.days)) return null;
  const built = buildAvailability({
    days: v.days,
    allDay: Boolean(v.allDay),
    from: v.from ?? null,
    to: v.to ?? null,
  });
  return built.ok ? built.value : null;
}

// ---------- Oficios de salud (cédula verificada en Salud) ----------

export type ClinicalLicense = {
  profession: string;
  verificationStatus: string;
  active: boolean;
};

const CLINICAL_PROFESSION: Record<string, RegExp> = {
  MEDICO: /medic|cirujan/,
  ENFERMERIA: /enfermer/,
  VETERINARIO: /veterinari|zootecni|\bmvz\b/,
};

/** ¿Su cédula verificada en Salud corresponde a este oficio? Ante la duda, no. */
export function clinicalTradeAllowed(
  trade: string,
  license: ClinicalLicense | null | undefined,
) {
  const pattern = CLINICAL_PROFESSION[trade];
  if (!pattern || !license) return false;
  if (license.verificationStatus !== 'VERIFIED' || !license.active)
    return false;
  const text = license.profession
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return pattern.test(text);
}

// ---------- Revalidar identidad ----------

export type RecheckState = 'OK' | 'DUE' | 'OVERDUE' | 'PENDING';

/**
 * Cada RECHECK_DAYS se pide una selfie nueva para comprobar que la cuenta la sigue usando la
 * misma persona. Al vencer hay unos días de gracia; después ya no puede ponerse Presente hasta
 * mandarla. Mientras el operador la revisa (PENDING) puede seguir trabajando.
 */
export function identityRecheck(
  provider: {
    status: string;
    identityCheckedAt: Date | null;
    reviewedAt: Date | null;
  },
  hasPendingSelfie: boolean,
  now = new Date(),
) {
  if (provider.status !== 'VERIFIED') return null;
  const base = provider.identityCheckedAt ?? provider.reviewedAt;
  if (!base) return null;
  const dueAt = new Date(base.getTime() + RECHECK_DAYS * 86_400_000);
  const blockAt = new Date(dueAt.getTime() + RECHECK_GRACE_DAYS * 86_400_000);
  const state: RecheckState = hasPendingSelfie
    ? 'PENDING'
    : now < dueAt
      ? 'OK'
      : now < blockAt
        ? 'DUE'
        : 'OVERDUE';
  return { state, dueAt, blockAt };
}
