/**
 * Recargas de saldo con Mercado Pago (Checkout Pro): el trabajador paga con tarjeta, OXXO o
 * transferencia y el saldo se suma solo. Aquí solo van las reglas, sin llamadas a internet.
 */

export const MERCADOPAGO_TOKEN_ENV = 'MERCADOPAGO_ACCESS_TOKEN';
/** Solo para pruebas: otra dirección del API de Mercado Pago. */
export const MERCADOPAGO_API_URL_ENV = 'MERCADOPAGO_API_URL';
export const MERCADOPAGO_API_URL = 'https://api.mercadopago.com';

/** Montos para elegir con un toque. */
export const ONLINE_TOPUP_AMOUNTS = [100, 200, 500, 1000] as const;

/** Así se marca cada recarga en Mercado Pago para reconocerla al volver. */
export const TOPUP_REFERENCE_PREFIX = 'tequio-recarga:';

export function mercadoPagoSettings(env: NodeJS.ProcessEnv = process.env) {
  const accessToken = env[MERCADOPAGO_TOKEN_ENV]?.trim() ?? '';
  const apiUrl = (
    env[MERCADOPAGO_API_URL_ENV]?.trim() || MERCADOPAGO_API_URL
  ).replace(/\/+$/, '');
  return { enabled: accessToken.length > 10, accessToken, apiUrl };
}

export function topupReference(topupId: string) {
  return `${TOPUP_REFERENCE_PREFIX}${topupId}`;
}

export function topupIdFrom(reference: string | null | undefined) {
  if (!reference?.startsWith(TOPUP_REFERENCE_PREFIX)) return null;
  const id = reference.slice(TOPUP_REFERENCE_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * A dónde regresa la persona al pagar. En producción siempre la dirección pública; en la
 * computadora de pruebas se acepta la del navegador solo si es localhost.
 */
export function returnBase(publicUrl: string, origin?: string | null) {
  if (publicUrl) return publicUrl;
  const local = (origin ?? '').replace(/\/+$/, '');
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(local)
    ? local
    : '';
}

export type MercadoPagoPayment = {
  id: number | string;
  status: string;
  currency_id?: string;
  transaction_amount?: number;
  external_reference?: string | null;
};

/** Qué hacer con un pago: acreditar, marcar rechazado o esperar (OXXO pendiente). */
export function paymentOutcome(
  payment: MercadoPagoPayment,
  expectedMxn: number,
): 'CREDIT' | 'REJECTED' | 'WAIT' {
  if (payment.status === 'approved') {
    const amountOk =
      payment.currency_id === 'MXN' &&
      typeof payment.transaction_amount === 'number' &&
      payment.transaction_amount + 0.001 >= expectedMxn;
    return amountOk ? 'CREDIT' : 'REJECTED';
  }
  if (
    ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(
      payment.status,
    )
  ) {
    return 'REJECTED';
  }
  return 'WAIT';
}
