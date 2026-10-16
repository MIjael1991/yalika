/** Arithmetic kept separate from persistence so small-business edge cases can be tested. */
export function calculateReception(
  packs: number,
  unitsPerPack: number,
  costPerPack?: number,
) {
  if (!Number.isSafeInteger(packs) || packs < 1 || packs > 10000 ||
      !Number.isSafeInteger(unitsPerPack) || unitsPerPack < 1 || unitsPerPack > 100000) {
    throw new Error('Cajas y unidades deben ser enteros positivos dentro de los límites');
  }
  const units = packs * unitsPerPack;
  if (!Number.isSafeInteger(units) || units > 1_000_000) {
    throw new Error('Máximo un millón de unidades por renglón');
  }
  if (costPerPack !== undefined &&
      (!Number.isFinite(costPerPack) || costPerPack < 0 || costPerPack > 100_000_000)) {
    throw new Error('El costo por caja no es válido');
  }
  // Preserve null semantics: unknown cost is never turned into a fictitious zero.
  const unitCost = costPerPack === undefined ? null : costPerPack / unitsPerPack;
  const totalCost = costPerPack === undefined ? null : Math.round(costPerPack * packs * 100) / 100;
  return { units, unitCost, totalCost };
}

export function grossProfit(sellingPrice: number, unitCost: number | null) {
  if (unitCost === null) return null;
  if (!Number.isFinite(sellingPrice) || !Number.isFinite(unitCost)) throw new Error('Importe inválido');
  return Math.round((sellingPrice - unitCost) * 100) / 100;
}
