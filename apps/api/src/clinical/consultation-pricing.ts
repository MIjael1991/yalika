export const YALIKA_CLINICAL_PILOT_PRICE = {
  currency: 'MXN',
  amountCents: 0,
  amount: 0,
  label: 'Gratis',
  mode: 'PILOT_CONFIGURABLE',
} as const;

export function resolvePilotConsultationPrice(
  configuredCents?: string | number | null,
) {
  if (
    configuredCents === undefined ||
    configuredCents === null ||
    configuredCents === ''
  ) {
    return YALIKA_CLINICAL_PILOT_PRICE;
  }

  const value = Number(configuredCents);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('Precio piloto inválido');
  }

  return {
    currency: 'MXN' as const,
    amountCents: value,
    amount: value / 100,
    label: value === 0 ? 'Gratis' : `$${(value / 100).toFixed(2)} MXN`,
    mode: 'PILOT_CONFIGURABLE' as const,
  };
}
