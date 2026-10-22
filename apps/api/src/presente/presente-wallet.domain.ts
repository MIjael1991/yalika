import {
  COMMISSION_PCT_ENV,
  DEFAULT_COMMISSION_PCT,
  DEFAULT_PROMO_COMMISSION_PCT,
  PROMO_COMMISSION_PCT_ENV,
  DEFAULT_WELCOME_CREDIT_MXN,
  TOPUP_BANK_ENV,
  TOPUP_CLABE_ENV,
  TOPUP_NAME_ENV,
  DEFAULT_WELCOME_LIMIT,
  WELCOME_CREDIT_ENV,
  WELCOME_LIMIT_ENV,
} from './presente.constants';

function setting(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  max: number,
) {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : fallback;
}

/** Porcentaje de comisión normal por trabajo (7 si no se configura; de 0 a 30). */
export const commissionPctSetting = (env: NodeJS.ProcessEnv = process.env) =>
  setting(env, COMMISSION_PCT_ENV, DEFAULT_COMMISSION_PCT, 30);

/** Porcentaje mientras le dura el regalo de fundador (10 si no se configura; de 0 a 30). */
export const promoCommissionPctSetting = (
  env: NodeJS.ProcessEnv = process.env,
) => setting(env, PROMO_COMMISSION_PCT_ENV, DEFAULT_PROMO_COMMISSION_PCT, 30);

/**
 * Qué porcentaje le toca: el de fundador mientras las comisiones que ha pagado no lleguen a su
 * regalo; después (o si nunca tuvo regalo), el normal.
 */
export function commissionFor(
  giftCents: number,
  paidCents: number,
  env: NodeJS.ProcessEnv = process.env,
) {
  const promo = giftCents > 0 && paidCents < giftCents;
  return {
    pct: promo ? promoCommissionPctSetting(env) : commissionPctSetting(env),
    promo,
    giftLeftMxn: promo ? centsToMxn(giftCents - paidCents) : 0,
  };
}

/** Saldo de bienvenida en pesos (100 si no se configura; 0 lo apaga). */
export const welcomeCreditSetting = (env: NodeJS.ProcessEnv = process.env) =>
  Math.floor(
    setting(env, WELCOME_CREDIT_ENV, DEFAULT_WELCOME_CREDIT_MXN, 1_000),
  );

/** Comisión en centavos sobre un precio en pesos: 7% de $350 = 2450 centavos ($24.50). */
export const commissionCents = (amountMxn: number, pct: number) =>
  Math.round(amountMxn * pct);

/** A cuántos trabajadores se les da el regalo de bienvenida (500 si no se configura). */
export const welcomeLimitSetting = (env: NodeJS.ProcessEnv = process.env) =>
  Math.floor(setting(env, WELCOME_LIMIT_ENV, DEFAULT_WELCOME_LIMIT, 1_000_000));

export const centsToMxn = (cents: number) => Math.round(cents) / 100;

/**
 * Referencia corta del trabajador para el concepto de su transferencia: "YP" + los primeros
 * 8 caracteres de su id. Con ella el operador sabe a quién acreditar.
 */
export const walletCode = (providerId: string) =>
  `YP${providerId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** Devuelve el inicio del id (8 caracteres) o null si la referencia no es válida. */
export function parseWalletCode(raw: string) {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  const match = /^YP([0-9A-F]{8})$/.exec(code);
  return match ? match[1].toLowerCase() : null;
}

/** Clave de rastreo SPEI o folio del pago: sin espacios y en mayúsculas. */
export function normalizeReference(raw: string) {
  const value = raw.toUpperCase().replace(/\s/g, '');
  return /^[A-Z0-9-]{4,40}$/.test(value) ? value : null;
}

/** Cuenta de Yalika para recargas; null mientras no esté configurada. */
export function topupInstructions(env: NodeJS.ProcessEnv = process.env) {
  const clabe = env[TOPUP_CLABE_ENV]?.replace(/\s/g, '') ?? '';
  if (!/^\d{18}$/.test(clabe)) return null;
  return {
    clabe,
    bank: env[TOPUP_BANK_ENV]?.trim() || null,
    name: env[TOPUP_NAME_ENV]?.trim() || 'Yalika',
  };
}
