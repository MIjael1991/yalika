/**
 * Sábana de seguridad: lo que pasó en un trabajo (mensajes, llamadas, grabaciones, llegada).
 * Los dos la ven y la descargan 30 días después de terminar; luego queda sellada (solo se entrega
 * con orden de una autoridad) y se borra al cumplir el plazo de resguardo.
 */

/** Días que el cliente y el trabajador pueden ver y descargar su sábana. */
export const USER_RECORD_DAYS = 30;
/** Días que Yalika guarda la copia sellada (lo ajusta el abogado por variable de entorno). */
export const SAFETY_KEEP_DAYS_ENV = 'PRESENTE_SAFETY_KEEP_DAYS';
export const DEFAULT_SAFETY_KEEP_DAYS = 365;

/** Grabación de llamada: hasta 4.2 MB (30 min a 16 kbps caben de sobra). */
export const RECORDING_MAX_BYTES = 4_200_000;
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

export function safetyKeepDays(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(env[SAFETY_KEEP_DAYS_ENV]);
  if (!Number.isInteger(value)) return DEFAULT_SAFETY_KEEP_DAYS;
  return Math.min(3650, Math.max(USER_RECORD_DAYS, value));
}

/** Cuándo terminó el trabajo (para contar los 30 días). Sigue en curso: null. */
export function jobEndedAt(request: {
  status: string;
  finishedAt: Date | null;
  updatedAt: Date;
  expiresAt: Date;
}) {
  if (request.finishedAt) return request.finishedAt;
  if (request.status === 'CANCELLED') return request.updatedAt;
  if (request.status === 'OPEN') {
    return request.expiresAt < new Date() ? request.expiresAt : null;
  }
  return null;
}

/** ¿Los dos todavía pueden ver su sábana? */
export function userRecordUntil(request: Parameters<typeof jobEndedAt>[0]) {
  const ended = jobEndedAt(request);
  return ended
    ? new Date(ended.getTime() + USER_RECORD_DAYS * 86_400_000)
    : null;
}

export function userRecordOpen(
  request: Parameters<typeof jobEndedAt>[0],
  now = new Date(),
) {
  const until = userRecordUntil(request);
  return !until || now <= until;
}

/** Audio de la grabación en data URL (webm/ogg/mp4). */
export function readAudioDataUrl(dataUrl: string) {
  const match =
    /^data:([\w/+.-]+)(?:;codecs=[\w.,]+)?;base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl,
    );
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!AUDIO_TYPES.includes(mime)) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 200 || bytes.length > RECORDING_MAX_BYTES) return null;
  return { mime, bytes };
}
