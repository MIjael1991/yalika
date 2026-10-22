/**
 * Factura por medio de Tequio: datos fiscales del cliente, IVA del presupuesto y revisión del
 * XML que sube el profesional (que sea un CFDI timbrado y para el RFC del cliente).
 */

export const IVA_PCT = 16;
/** Días que tiene el profesional para mandar la factura antes de que el cliente califique sin ella. */
export const INVOICE_DAYS = 3;

/**
 * ¿Ya puede calificar el cliente? Sin factura pedida, al terminar. Con factura, cuando llega, o
 * pasados INVOICE_DAYS sin que llegue (y entonces su calificación dice «No entregó factura»).
 */
export function reviewGate(
  request: { needsInvoice: boolean; finishedAt: Date | null },
  invoiceSent: boolean,
  now = new Date(),
) {
  if (!request.needsInvoice || invoiceSent || !request.finishedAt) {
    return { open: true, invoiceMissing: false, opensAt: null as Date | null };
  }
  const opensAt = new Date(
    request.finishedAt.getTime() + INVOICE_DAYS * 86_400_000,
  );
  const open = now >= opensAt;
  return { open, invoiceMissing: open, opensAt };
}

/** IVA de un precio en pesos (con centavos). */
export const ivaFor = (amountMxn: number) =>
  Math.round(amountMxn * IVA_PCT) / 100;

/** RFC de persona moral (12) o física (13). */
export const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

export const normalizeRfc = (raw: string) =>
  raw.toUpperCase().replace(/[\s-]/g, '');

/** Regímenes fiscales más comunes del catálogo del SAT. */
export const FISCAL_REGIMES: readonly (readonly [string, string])[] = [
  ['601', 'General de Ley Personas Morales'],
  ['603', 'Personas Morales con Fines no Lucrativos'],
  ['605', 'Sueldos y Salarios'],
  ['606', 'Arrendamiento'],
  ['612', 'Actividades Empresariales y Profesionales'],
  ['616', 'Sin obligaciones fiscales'],
  ['621', 'Incorporación Fiscal'],
  ['625', 'Plataformas Tecnológicas'],
  ['626', 'Régimen Simplificado de Confianza'],
];

/** Usos del CFDI más comunes. */
export const CFDI_USES: readonly (readonly [string, string])[] = [
  ['G03', 'Gastos en general'],
  ['D01', 'Honorarios médicos, dentales y hospitalarios'],
  ['G01', 'Adquisición de mercancías'],
  ['S01', 'Sin efectos fiscales'],
];

export type InvoiceData = {
  rfc: string;
  name: string;
  regime: string;
  zip: string;
  use: string;
  email: string | null;
};

/** Qué falta en los datos fiscales (vacío si están completos). */
export function fiscalProblems(data: Partial<InvoiceData>) {
  const problems: string[] = [];
  if (!data.rfc || !RFC_PATTERN.test(normalizeRfc(data.rfc)))
    problems.push('RFC');
  if (!data.name?.trim()) problems.push('NOMBRE');
  if (!data.regime || !FISCAL_REGIMES.some(([code]) => code === data.regime))
    problems.push('REGIMEN');
  if (!data.zip || !/^\d{5}$/.test(data.zip)) problems.push('CP');
  if (!data.use || !CFDI_USES.some(([code]) => code === data.use))
    problems.push('USO');
  return problems;
}

/** Lo básico de un CFDI: que sea comprobante, su folio fiscal (UUID), el RFC receptor y el total. */
export function readCfdi(xml: string) {
  if (!/<(?:\w+:)?Comprobante\b/i.test(xml)) return null;
  const attr = (tag: string, name: string) =>
    new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*\\b${name}="([^"]+)"`, 'i').exec(
      xml,
    )?.[1] ?? null;
  const total = attr('Comprobante', 'Total');
  return {
    uuid: attr('TimbreFiscalDigital', 'UUID'),
    receiverRfc: attr('Receptor', 'Rfc'),
    total:
      total !== null && Number.isFinite(Number(total)) ? Number(total) : null,
  };
}

/** Archivo en data URL (PDF o XML) a bytes, con tope de tamaño. */
export function readFileDataUrl(
  dataUrl: string,
  kind: 'pdf' | 'xml',
  maxBytes: number,
) {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const okMime =
    kind === 'pdf'
      ? mime === 'application/pdf'
      : ['text/xml', 'application/xml'].includes(mime);
  if (!okMime) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > maxBytes) return null;
  if (kind === 'pdf' && bytes.subarray(0, 4).toString() !== '%PDF') return null;
  return { mime: kind === 'pdf' ? 'application/pdf' : 'text/xml', bytes };
}
