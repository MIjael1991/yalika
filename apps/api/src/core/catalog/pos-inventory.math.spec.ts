import { calculateReception, grossProfit } from './pos-inventory.math';

describe('R7: cálculo de entradas sin inventar costos', () => {
  it('convierte cajas a unidades y calcula el costo unitario', () => {
    expect(calculateReception(5, 12, 90)).toEqual({ units: 60, unitCost: 7.5, totalCost: 450 });
  });
  it('conserva costo desconocido como null', () => {
    expect(calculateReception(2, 24)).toEqual({ units: 48, unitCost: null, totalCost: null });
    expect(grossProfit(15, null)).toBeNull();
  });
  it('distingue costo cero informado explícitamente', () => {
    expect(calculateReception(1, 10, 0).unitCost).toBe(0);
  });
  it('calcula margen bruto sin confundirlo con utilidad neta', () => {
    expect(grossProfit(10, 7.5)).toBe(2.5);
  });
  it.each([[0, 12], [2, 0], [1.5, 12], [-3, 5], [10000, 100000]])(
    'rechaza cantidades ilegales o superiores al máximo: %s x %s', (a, b) => {
      expect(() => calculateReception(a, b)).toThrow();
    });
  it('rechaza precios no finitos y negativos', () => {
    expect(() => calculateReception(1, 10, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => calculateReception(1, 10, -1)).toThrow();
  });
});
