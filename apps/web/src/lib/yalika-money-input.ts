/**
 * Lee un importe escrito a mano en la caja o en el celular.
 *
 * Acepta "100", "100.5", "100,50" (teclado en español), "$1,000.50", "1.000,50"
 * y "1 000". Regresa pesos con centavos exactos, o NaN si el texto no es un importe
 * válido (vacío, letras, negativo). Nunca regresa fracciones de centavo.
 */
export function parseMoneyInput(value: string): number {
  const text = value.trim().replace(/[$\s]/g, '');
  if (!text || !/^[\d.,]+$/.test(text) || !/\d/.test(text)) return Number.NaN;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let normalized: string;

  if (lastDot !== -1 && lastComma !== -1) {
    // El último separador es el decimal; el otro agrupa miles.
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    const [whole, fraction, ...extra] = text.split(decimal);
    const grouped = new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})*$`);
    if (extra.length || fraction === undefined || !grouped.test(whole)) return Number.NaN;
    normalized = `${whole.split(thousands).join('')}.${fraction}`;
  } else if (lastComma !== -1) {
    // "1,000" o "1,000,000" son miles; "100,5" y "100,50" son decimales.
    normalized = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (lastDot !== -1) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(text) && text.split('.').length > 2 ? text.replace(/\./g, '') : text;
  } else {
    normalized = text;
  }

  if ((normalized.match(/\./g) ?? []).length > 1) return Number.NaN;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
