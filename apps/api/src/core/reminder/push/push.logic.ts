// Reglas puras de los avisos push (sin base de datos), faciles de probar.

/** Solo se envian avisos a los servicios de push de los navegadores conocidos (evita enviar a cualquier URL). */
const allowedPushHosts = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isAllowedPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowedPushHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

export const MAX_PUSHES_PER_REMINDER = 18;
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

/** Cada 5 min las primeras 6 veces; luego cada 30 min hasta 18 avisos (unas 6 horas). */
export function nextPushDelayMs(sentCount: number) {
  return sentCount < 6 ? 5 * 60_000 : 30 * 60_000;
}

export function shouldSendPush(
  state: { sentCount: number; lastSentAt: Date } | null,
  remindAt: Date,
  now: Date,
) {
  if (now.getTime() - remindAt.getTime() > 24 * 60 * 60_000) return false;
  // Si se pospuso (el aviso quedó después del último envío), se empieza de nuevo.
  if (!state || state.lastSentAt.getTime() < remindAt.getTime()) return true;
  if (state.sentCount >= MAX_PUSHES_PER_REMINDER) return false;
  return now.getTime() - state.lastSentAt.getTime() >= nextPushDelayMs(state.sentCount);
}

export function isSensitiveTask(task: {
  category?: string | null;
  space?: { type?: string | null; name?: string | null } | null;
}) {
  const where = `${task.category ?? ''} ${task.space?.type ?? ''} ${task.space?.name ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return /salud|health|vet|medic/.test(where);
}

/** En la pantalla bloqueada no se muestran datos de salud. */
export function buildPushPayload(
  reminder: { id: string; taskId: string },
  task: {
    title: string;
    category?: string | null;
    space?: { type?: string | null; name?: string | null } | null;
  },
) {
  const sensitive = isSensitiveTask(task);
  return {
    title: sensitive ? '⏰ Tienes un pendiente importante' : `⏰ ${task.title}`,
    body: sensitive
      ? 'Ábrelo en Yalika para ver los detalles.'
      : 'Dime: ya lo hice, o lo dejamos para después.',
    tag: `yalika-aviso-${reminder.id}`,
    taskId: reminder.taskId,
    reminderId: reminder.id,
    url: '/inicio',
  };
}
