import { BadRequestException } from '@nestjs/common';

export type DiscountType = 'percentage' | 'fixed' | 'special_price';

export function toCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromCents(value: number) {
  return value / 100;
}

export function calculateDiscountCents(
  type: DiscountType,
  value: number,
  baseCents: number,
  quantity?: number,
) {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException('El valor del descuento no es válido');
  }

  if (type === 'percentage') {
    if (value <= 0 || value > 100) {
      throw new BadRequestException(
        'El porcentaje debe ser mayor a 0 y máximo 100',
      );
    }

    return Math.min(Math.round((baseCents * value) / 100), baseCents);
  }

  if (type === 'fixed') {
    const fixedCents = toCents(value);
    if (fixedCents <= 0 || fixedCents > baseCents) {
      throw new BadRequestException(
        'El descuento fijo debe ser mayor a cero y no superar el importe disponible',
      );
    }

    return fixedCents;
  }

  if (!quantity || quantity <= 0) {
    throw new BadRequestException(
      'El precio especial solo puede aplicarse a un producto',
    );
  }

  const specialTotalCents = Math.round(toCents(value) * quantity);
  if (specialTotalCents > baseCents) {
    throw new BadRequestException(
      'El precio especial no puede superar el precio original',
    );
  }

  return baseCents - specialTotalCents;
}

export function calculateBuyXGetYDiscountCents(
  unitPrice: number,
  quantity: number,
  buyQuantity: number,
  getQuantity: number,
) {
  if (
    !Number.isFinite(unitPrice) ||
    unitPrice < 0 ||
    !Number.isInteger(quantity) ||
    !Number.isInteger(buyQuantity) ||
    !Number.isInteger(getQuantity) ||
    quantity < 0 ||
    buyQuantity < 1 ||
    getQuantity < 1
  ) {
    throw new BadRequestException(
      'Las cantidades de Compra X y recibe Y no son válidas',
    );
  }

  const groupSize = buyQuantity + getQuantity;
  const freeUnits = Math.floor(quantity / groupSize) * getQuantity;

  return toCents(unitPrice) * freeUnits;
}

export function allocateCents(totalCents: number, weights: number[]) {
  if (totalCents < 0 || !Number.isInteger(totalCents)) {
    throw new BadRequestException('El importe a distribuir no es válido');
  }
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new BadRequestException('La base de distribución no es válida');
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalCents === 0) {
    return weights.map(() => 0);
  }
  if (totalWeight <= 0) {
    throw new BadRequestException(
      'No existe una base para distribuir el descuento',
    );
  }

  const rawShares = weights.map(
    (weight) => (totalCents * weight) / totalWeight,
  );
  const shares = rawShares.map((share) => Math.floor(share));
  let remainder = totalCents - shares.reduce((sum, share) => sum + share, 0);

  const priority = rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction || left.index - right.index,
    );

  for (let index = 0; index < priority.length && remainder > 0; index++) {
    shares[priority[index].index] += 1;
    remainder -= 1;
  }

  return shares;
}
