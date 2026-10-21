// Copia de una credencial (INE, licencia…) por los dos lados, lista para imprimir. Todo se hace en el dispositivo.
import { detectDocument, type Pixels, type Quad } from "./yalika-scan";
// Credencial tamaño ID-1 (la de INE, licencia y tarjetas bancarias): 85.6 × 53.98 mm.
export const CARD_MM = { w: 85.6, h: 53.98 } as const;
export const CARD_RATIO = CARD_MM.w / CARD_MM.h;
export const PAPER_MM = { letter: { w: 215.9, h: 279.4 }, a4: { w: 210, h: 297 } } as const;
export const SIZE_SCALE = { real: 1, large: 1.5 } as const;
export type Paper = keyof typeof PAPER_MM;
export type CardSize = keyof typeof SIZE_SCALE;
export type Layout = "same" | "separate";
export type SheetOptions = { paper: Paper; layout: Layout; size: CardSize };
export type Side = "front" | "back";
export type Placement = { page: number; side: Side; x: number; y: number; w: number; h: number };
export type SheetPlan = { paper: { w: number; h: number }; pages: number; items: Placement[] };
export const DPI = 300;
const GAP_MM = 14;
// Dónde va cada lado en la hoja, en milímetros desde la esquina de arriba a la izquierda.
// «same»: los dos lados en una sola hoja, uno sobre otro. «separate»: cada lado en su hoja (salto de página).
export function sheetPlan(o: SheetOptions): SheetPlan {
  const paper = PAPER_MM[o.paper],
    k = SIZE_SCALE[o.size],
    w = CARD_MM.w * k,
    h = CARD_MM.h * k,
    x = (paper.w - w) / 2;
  if (o.layout === "separate") {
    const y = (paper.h - h) * 0.28;
    return {
      paper,
      pages: 2,
      items: [
        { page: 0, side: "front", x, y, w, h },
        { page: 1, side: "back", x, y, w, h },
      ],
    };
  }
  const total = 2 * h + GAP_MM,
    y = Math.max(12, (paper.h - total) * 0.28);
  if (y + total > paper.h - 12) throw Error("Las dos caras no caben en una hoja a ese tamaño.");
  return {
    paper,
    pages: 1,
    items: [
      { page: 0, side: "front", x, y, w, h },
      { page: 0, side: "back", x, y: y + h + GAP_MM, w, h },
    ],
  };
}
// La leyenda que se imprime sobre la copia («Solo para trámite…»): sin saltos ni espacios de más y con límite de largo.
export const MAX_NOTE = 48;
export const cleanNote = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
// Tamaño en píxeles de cada lado para imprimir a 300 ppp.
export const cardPixels = (size: CardSize) => ({
  w: Math.round((CARD_MM.w * SIZE_SCALE[size] * DPI) / 25.4),
  h: Math.round((CARD_MM.h * SIZE_SCALE[size] * DPI) / 25.4),
});
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
// Largo entre ancho de lo que encierran las 4 esquinas (en píxeles de la foto).
export function quadAspect(q: Quad, width: number, height: number) {
  const P = q.map((p) => ({ x: p.x * width, y: p.y * height })),
    long = (dist(P[0], P[1]) + dist(P[3], P[2])) / 2,
    short = (dist(P[0], P[3]) + dist(P[1], P[2])) / 2;
  return short > 0 ? long / short : 0;
}
// Cuadro centrado con la proporción de una credencial, para empezar a acomodar las esquinas a mano.
export function defaultCardQuad(width: number, height: number): Quad {
  const fit = 0.86,
    w = Math.min(fit * width, fit * height * CARD_RATIO),
    h = w / CARD_RATIO,
    x0 = (width - w) / 2 / width,
    x1 = x0 + w / width,
    y0 = (height - h) / 2 / height,
    y1 = y0 + h / height;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}
// Busca la credencial por contraste con la mesa: lo que se distingue del color del fondo (tomado de los bordes de la foto)
// y forma la mancha más grande. A diferencia de buscar «lo más claro», no pierde la franja de color que tienen las credenciales.
export function detectByBackground(p: Pixels): Quad | null {
  const step = Math.max(1, Math.round(Math.max(p.width, p.height) / 320)),
    w = Math.floor(p.width / step),
    h = Math.floor(p.height / step);
  if (w < 16 || h < 16) return null;
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Promedio del bloque, para que el ruido de la foto no se vuelva «borde».
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < step; dy++)
        for (let dx = 0; dx < step; dx++) {
          const i = ((y * step + dy) * p.width + x * step + dx) * 4;
          r += p.data[i];
          g += p.data[i + 1];
          b += p.data[i + 2];
        }
      const n = step * step,
        o = (y * w + x) * 3;
      rgb[o] = r / n;
      rgb[o + 1] = g / n;
      rgb[o + 2] = b / n;
    }
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.04)),
    edge: number[][] = [[], [], []];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (x < band || y < band || x >= w - band || y >= h - band) for (let c = 0; c < 3; c++) edge[c].push(rgb[(y * w + x) * 3 + c]);
  const bg = edge.map((v) => v.sort((a, b) => a - b)[v.length >> 1]),
    far = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) far[i] = Math.hypot(rgb[i * 3] - bg[0], rgb[i * 3 + 1] - bg[1], rgb[i * 3 + 2] - bg[2]) > 48 ? 1 : 0;
  const label = new Int32Array(w * h),
    stack: number[] = [];
  let best = 0,
    bestId = 0,
    id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!far[s] || label[s]) continue;
    id++;
    let size = 0;
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const c = stack.pop()!,
        cx = c % w;
      size++;
      for (const n of [cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1, c >= w ? c - w : -1, c < w * (h - 1) ? c + w : -1])
        if (n >= 0 && far[n] && !label[n]) {
          label[n] = id;
          stack.push(n);
        }
    }
    if (size > best) {
      best = size;
      bestId = id;
    }
  }
  if (best / (w * h) < 0.08 || best / (w * h) > 0.9) return null;
  // Esquinas: los puntos más lejanos en las cuatro diagonales (sirve para una credencial girada).
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = Infinity;
  let pTL = { x: 0, y: 0 }, pBR = pTL, pTR = pTL, pBL = pTL;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== bestId) continue;
      const sum = x + y,
        diff = x - y;
      if (sum < tl) { tl = sum; pTL = { x, y }; }
      if (sum > br) { br = sum; pBR = { x, y }; }
      if (diff > tr) { tr = diff; pTR = { x, y }; }
      if (diff < bl) { bl = diff; pBL = { x, y }; }
    }
  return [pTL, pTR, pBR, pBL].map((pt) => ({ x: (pt.x + 0.5) / w, y: (pt.y + 0.5) / h })) as Quad;
}
const cardLike = (a: number) => (a >= 1.35 && a <= 1.85) || (a >= 0.54 && a <= 0.74);
const off = (a: number) => Math.abs(Math.log((a >= 1 ? a : 1 / a) / CARD_RATIO));
// Busca la credencial en la foto con dos métodos y se queda con el que tenga forma de credencial; si ninguno,
// deja el cuadro por defecto para que se acomode a mano.
export function pickCardQuad(p: Pixels): { quad: Quad; found: boolean } {
  const found = [detectDocument(p), detectByBackground(p)]
    .filter((q): q is Quad => !!q)
    .map((quad) => ({ quad, a: quadAspect(quad, p.width, p.height) }))
    .filter((c) => cardLike(c.a))
    .sort((m, n) => off(m.a) - off(n.a))[0];
  return found ? { quad: found.quad, found: true } : { quad: defaultCardQuad(p.width, p.height), found: false };
}
// Pasa a grises (para fotocopia en blanco y negro) con un poco más de contraste.
export function toGray(p: Pixels): Pixels {
  const out = new Uint8ClampedArray(p.data.length);
  for (let i = 0; i < p.data.length; i += 4) {
    const g = 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2],
      v = (g - 128) * 1.12 + 128 + 6;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width: p.width, height: p.height };
}
// PDF de la hoja: cada lado a su tamaño real (o ampliado), con el salto de página que se haya elegido.
export async function inePdf(cards: Partial<Record<Side, Uint8Array>>, o: SheetOptions, title = "Copia de identificación"): Promise<Blob> {
  const plan = sheetPlan(o),
    items = plan.items.filter((i) => cards[i.side]);
  if (!items.length) throw Error("Agrega al menos una foto.");
  const { jsPDF } = await import("jspdf"),
    pdf = new jsPDF({ unit: "mm", format: [plan.paper.w, plan.paper.h], orientation: "portrait" });
  let page = -1;
  for (const it of items) {
    // Si falta un lado, se imprime solo el que hay, en su lugar.
    if (it.page !== page) {
      if (page >= 0) pdf.addPage([plan.paper.w, plan.paper.h], "portrait");
      page = it.page;
    }
    pdf.addImage(cards[it.side]!, "JPEG", it.x, it.y, it.w, it.h);
  }
  pdf.setProperties({ title: title.slice(0, 160) });
  return pdf.output("blob");
}
