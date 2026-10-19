// Mejora de imágenes tipo escáner y PDF multipágina. Todo se procesa en el dispositivo.
export type ScanMode = "original" | "color" | "gray" | "bw";
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Margins = { top: number; right: number; bottom: number; left: number };
export type Point = { x: number; y: number };
// Esquinas del documento en proporción 0..1: arriba-izq, arriba-der, abajo-der, abajo-izq.
export type Quad = [Point, Point, Point, Point];
export type ScanOptions = {
  mode: ScanMode;
  turns: number;
  margins: Margins;
  quad?: Quad | null;
  brightness?: number; // -100..100, 0 = sin cambio
  contrast?: number; // -100..100, 0 = sin cambio
};
export type PageSize = "a4" | "letter" | "fit";
// Cómo se ve la hoja del PDF alrededor de la imagen: márgenes, color de fondo y marco.
export type PageLayout = {
  margin: "none" | "small" | "normal" | "wide";
  background: string;
  frame: "none" | "thin" | "thick";
  frameColor: string;
};
export const DEFAULT_LAYOUT: PageLayout = { margin: "small", background: "#ffffff", frame: "none", frameColor: "#000000" };
export const MARGIN_PT = { none: 0, small: 12, normal: 28, wide: 48 } as const;
export const FRAME_PT = { none: 0, thin: 1, thick: 3 } as const;
export const isColor = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
const rgb = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];
export type PdfPage = { jpeg: Uint8Array; width: number; height: number };
export const MAX_PAGES = 30;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_SIDE = 2000;
export const PREVIEW_SIDE = 1000;
export const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };
const MAX_MARGIN = 0.45;

export function checkImageFile(file: { name: string; type: string; size: number }) {
  if (!file.type.startsWith("image/"))
    return "«" + file.name + "» no es una imagen.";
  if (file.size > MAX_IMAGE_BYTES)
    return "«" + file.name + "» pesa más de 20 MB.";
  return "";
}

function assertPixels(p: Pixels) {
  if (
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    p.width < 1 ||
    p.height < 1 ||
    p.data.length !== p.width * p.height * 4
  )
    throw Error("Imagen no válida.");
}

export function rotate(p: Pixels, turns: number): Pixels {
  assertPixels(p);
  const t = ((Math.round(turns) % 4) + 4) % 4;
  if (!t) return p;
  const { width: w, height: h, data } = p;
  const nw = t === 2 ? w : h,
    nh = t === 2 ? h : w;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = t === 1 ? h - 1 - y : t === 2 ? w - 1 - x : y,
        ny = t === 1 ? x : t === 2 ? h - 1 - y : w - 1 - x,
        s = (y * w + x) * 4,
        d = (ny * nw + nx) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = data[s + 3];
    }
  return { data: out, width: nw, height: nh };
}

export function crop(p: Pixels, m: Margins): Pixels {
  assertPixels(p);
  const c = (v: number) => Math.min(MAX_MARGIN, Math.max(0, Number.isFinite(v) ? v : 0));
  const x0 = Math.floor(p.width * c(m.left)),
    x1 = p.width - Math.floor(p.width * c(m.right)),
    y0 = Math.floor(p.height * c(m.top)),
    y1 = p.height - Math.floor(p.height * c(m.bottom));
  if (!x0 && !y0 && x1 === p.width && y1 === p.height) return p;
  const w = x1 - x0,
    h = y1 - y0;
  if (w < 1 || h < 1) throw Error("El recorte deja la imagen vacía.");
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * p.width + x0) * 4;
    out.set(p.data.subarray(s, s + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}

function otsu(hist: Uint32Array, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0,
    sumB = 0,
    best = 0,
    threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB,
      mF = (sum - sumB) / wF,
      between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

const PAPER_WHITE = 250;
// Quita sombras dividiendo entre el brillo local, luego aplica el modo elegido.
export function enhance(p: Pixels, mode: ScanMode): Pixels {
  assertPixels(p);
  if (mode === "original") return p;
  const { width: w, height: h, data } = p,
    n = w * h,
    lum = new Float32Array(n);
  for (let i = 0; i < n; i++)
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const W = w + 1,
    ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += lum[y * w + x];
      ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.max(w, h) / 16)),
    out = new Uint8ClampedArray(n * 4),
    hist = new Uint32Array(256),
    mean1 = new Float32Array(n),
    box = (ix: Float64Array, x: number, y: number) => {
      const y0 = Math.max(0, y - r),
        y1 = Math.min(h, y + r + 1),
        x0 = Math.max(0, x - r),
        x1 = Math.min(w, x + r + 1);
      return (ix[y1 * W + x1] - ix[y0 * W + x1] - ix[y1 * W + x0] + ix[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
    };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mean1[y * w + x] = box(ii, x, y);
  // Segunda pasada: el fondo es el promedio solo de lo claro (sin la tinta). Así el papel queda parejo y no hay halos junto al texto.
  const paper = new Float64Array(W * (h + 1)),
    count = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let a = 0,
      c = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (lum[i] >= mean1[i] * 0.92) {
        a += lum[i];
        c++;
      }
      paper[(y + 1) * W + x + 1] = paper[y * W + x + 1] + a;
      count[(y + 1) * W + x + 1] = count[y * W + x + 1] + c;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        c = box(count, x, y),
        bg = c > 0.02 ? box(paper, x, y) / c : mean1[i],
        gain = Math.min(4, 248 / Math.max(bg, 1));
      if (mode === "color") {
        out[i * 4] = data[i * 4] * gain;
        out[i * 4 + 1] = data[i * 4 + 1] * gain;
        out[i * 4 + 2] = data[i * 4 + 2] * gain;
        hist[Math.round(0.299 * out[i * 4] + 0.587 * out[i * 4 + 1] + 0.114 * out[i * 4 + 2])]++;
      } else {
        const v = Math.round(Math.min(255, lum[i] * gain));
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
        hist[v]++;
      }
      out[i * 4 + 3] = 255;
    }
  }
  if (mode === "bw") {
    const t = otsu(hist, n);
    for (let i = 0; i < n; i++) {
      const v = out[i * 4] > t ? 255 : 0;
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    }
  } else {
    let acc = 0,
      low = 0;
    for (; low < 100 && acc + hist[low] < n * 0.005; low++) acc += hist[low];
    // Negro en el 0.5 % más oscuro y blanco puro desde 250: el papel queda blanco y parejo (sin grano ni tonos grises).
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 3; c++)
        out[i * 4 + c] = ((out[i * 4 + c] - low) * 255) / (PAPER_WHITE - low);
  }
  return { data: out, width: w, height: h };
}

// Brillo y contraste a gusto (después de la mejora automática). En blanco y negro no se aplican.
export function adjust(p: Pixels, brightness = 0, contrast = 0): Pixels {
  const b = Math.max(-100, Math.min(100, brightness)) * 1.28,
    c = Math.max(-100, Math.min(100, contrast)),
    f = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
  if (!b && !c) return p;
  const out = new Uint8ClampedArray(p.data.length);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = f * (p.data[i] - 128) + 128 + b;
    out[i + 1] = f * (p.data[i + 1] - 128) + 128 + b;
    out[i + 2] = f * (p.data[i + 2] - 128) + 128 + b;
    out[i + 3] = 255;
  }
  return { data: out, width: p.width, height: p.height };
}

// ---- Foto borrosa o con ruido: se mide y, solo si hace falta, se limpia y se aclara antes de mejorar ----
function luminance(p: Pixels) {
  const n = p.width * p.height,
    lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * p.data[i * 4] + 0.587 * p.data[i * 4 + 1] + 0.114 * p.data[i * 4 + 2];
  return lum;
}
// Desenfoque rápido: tres pasadas de promedio (se parece a una campana gaussiana).
function boxBlur(src: Float32Array, w: number, h: number, radius: number) {
  const r = Math.max(1, Math.round(radius)),
    a = Float32Array.from(src),
    b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = sum / (2 * r + 1);
        sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / (2 * r + 1);
        sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}
// Ruido (desviación estimada, en niveles de gris) y desenfoque (tamaño estimado del borroso, en píxeles).
export function imageQuality(p: Pixels): { noise: number; blur: number } {
  assertPixels(p);
  const { width: w, height: h } = p,
    lum = luminance(p),
    lap: number[] = [],
    tiles: number[][] = Array.from({ length: 64 }, () => []),
    grad: number[] = [],
    step = Math.max(1, Math.floor(Math.sqrt((w * h) / 120000)));
  for (let y = 1; y < h - 1; y += step)
    for (let x = 1; x < w - 1; x += step) {
      const i = y * w + x,
        c = lum[i];
      const l = Math.abs(4 * c - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w]);
      lap.push(l);
      tiles[Math.min(7, Math.floor((y * 8) / h)) * 8 + Math.min(7, Math.floor((x * 8) / w))].push(l);
      grad.push(Math.hypot(lum[i + 1] - lum[i - 1], lum[i + w] - lum[i - w]) / 2);
    }
  const sorted = (a: number[]) => a.slice().sort((m, n) => m - n),
    q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))],
    L = sorted(lap),
    G = sorted(grad),
    lo = sorted(Array.from(lum.filter((_, i) => i % (step * step + 1) === 0))),
    contrast = Math.max(1, q(lo, 0.97) - q(lo, 0.02));
  // En las zonas lisas la «laplaciana» solo es ruido: su mediana ≈ 0.6745 · σ · √20 (4 vecinos y el centro).
  // Se mide por zonas y se toma la más ruidosa de las 6 peores (una esquina oscura puede tener mucho grano y el resto no).
  const perTile = tiles
      .filter((t) => t.length >= 30)
      .map((t) => q(sorted(t), 0.5) / (0.6745 * Math.sqrt(20)))
      .sort((m, n) => n - m),
    noise = Math.max(q(L, 0.5) / (0.6745 * Math.sqrt(20)), perTile[Math.min(perTile.length - 1, 5)] ?? 0),
    slope = q(G, 0.995) / contrast;
  return { noise, blur: slope > 0 ? Math.min(20, 0.4 / slope) : 20 };
}
const NOISY = 20;
const BLURRY = 2;
// Quita ruido fuerte y devuelve nitidez a un texto borroso. Si la foto está bien, la deja igual.
export function clarify(p: Pixels, tune: { amount?: number; reach?: number } = {}): Pixels {
  const q = imageQuality(p);
  if (q.noise < NOISY && q.blur < BLURRY) return p;
  const { width: w, height: h } = p,
    chans = [0, 1, 2].map((c) => {
      const ch = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) ch[i] = p.data[i * 4 + c];
      return ch;
    });
  let work = chans;
  let blur = q.blur;
  // Hasta tres pasadas de limpieza, mientras todavía se vea grano.
  for (let pass = 0, noise = q.noise; pass < 3 && noise >= NOISY; pass++) {
    work = work.map((c) => boxBlur(c, w, h, 1));
    const after = imageQuality({ data: pack(work, w, h), width: w, height: h });
    noise = after.noise;
    blur = after.blur;
  }
  if (blur >= BLURRY) {
    const radius = Math.max(2, Math.min(10, blur * (tune.reach ?? 1.25))), amount = tune.amount ?? 3;
    work = work.map((c) => {
      const soft = boxBlur(c, w, h, radius),
        out = new Float32Array(c.length);
      for (let i = 0; i < c.length; i++) out[i] = c[i] + amount * (c[i] - soft[i]);
      return out;
    });
  }
  return { data: pack(work, w, h), width: w, height: h };
}
function pack(chans: Float32Array[], w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = chans[0][i];
    out[i * 4 + 1] = chans[1][i];
    out[i * 4 + 2] = chans[2][i];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function processPixels(base: Pixels, o: ScanOptions): Pixels {
  const flat = o.quad ? warp(base, o.quad) : base,
    framed = crop(rotate(flat, o.turns), o.margins),
    // Primero se quita la sombra (si no, se amplificaría el ruido de la parte oscura) y después se limpia y se aclara.
    done =
      o.mode === "original"
        ? framed
        : o.mode === "bw"
          ? enhance(clarify(enhance(framed, "gray")), "bw")
          : clarify(enhance(framed, o.mode));
  return o.mode === "bw" ? done : adjust(done, o.brightness, o.contrast);
}

function shrink(p: Pixels, target: number) {
  const k = Math.max(1, Math.ceil(Math.max(p.width, p.height) / target)),
    w = Math.max(1, Math.floor(p.width / k)),
    h = Math.max(1, Math.floor(p.height / k)),
    gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const s = ((y * k + j) * p.width + x * k + i) * 4;
          sum += 0.299 * p.data[s] + 0.587 * p.data[s + 1] + 0.114 * p.data[s + 2];
        }
      gray[y * w + x] = sum / (k * k);
    }
  return { gray, w, h };
}

// Busca la hoja como la región clara más grande y devuelve sus 4 esquinas.
// Si no hay un borde claro (fondo blanco, hoja casi del tamaño de la foto) devuelve null.
export function detectDocument(p: Pixels): Quad | null {
  assertPixels(p);
  const { gray, w, h } = shrink(p, 400);
  if (w < 8 || h < 8) return null;
  const hist = new Uint32Array(256);
  for (const v of gray) hist[Math.min(255, Math.round(v))]++;
  const t = otsu(hist, w * h),
    label = new Int32Array(w * h),
    stack: number[] = [];
  let best = 0,
    bestId = 0,
    id = 0;
  for (let s = 0; s < w * h; s++) {
    if (label[s] || gray[s] <= t) continue;
    id++;
    let size = 0;
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const c = stack.pop()!,
        cx = c % w;
      size++;
      for (const n of [
        cx > 0 ? c - 1 : -1,
        cx < w - 1 ? c + 1 : -1,
        c >= w ? c - w : -1,
        c < w * (h - 1) ? c + w : -1,
      ])
        if (n >= 0 && !label[n] && gray[n] > t) {
          label[n] = id;
          stack.push(n);
        }
    }
    if (size > best) {
      best = size;
      bestId = id;
    }
  }
  const share = best / (w * h);
  if (share < 0.15 || share > 0.97) return null;
  // Una hoja de verdad termina en un borde marcado. Si la «región clara» solo es el lado mejor iluminado de una
  // foto (una sombra que va de oscuro a claro), el cambio es suave: no se recorta, para no perder la parte en sombra.
  // «Fuera» = lo que toca el borde de la foto sin ser hoja (los huecos del texto dentro de la hoja no cuentan).
  const outside = new Uint8Array(w * h),
    queue: number[] = [];
  const mark = (i: number) => {
    if (!outside[i] && label[i] !== bestId) {
      outside[i] = 1;
      queue.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    mark(x);
    mark((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    mark(y * w);
    mark(y * w + w - 1);
  }
  while (queue.length) {
    const c = queue.pop()!,
      cx = c % w;
    if (cx > 0) mark(c - 1);
    if (cx < w - 1) mark(c + 1);
    if (c >= w) mark(c - w);
    if (c < w * (h - 1)) mark(c + w);
  }
  const steps: number[] = [],
    D = 4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== bestId) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !outside[ny * w + nx]) continue;
        const ix = x - dx * D,
          iy = y - dy * D,
          ox = x + dx * (D + 1),
          oy = y + dy * (D + 1);
        if (ix < 0 || iy < 0 || ix >= w || iy >= h || ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
        steps.push(gray[iy * w + ix] - gray[oy * w + ox]);
      }
    }
  if (steps.length) {
    steps.sort((m, n) => m - n);
    if (steps[steps.length >> 1] < 20) return null;
  }
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = Infinity;
  let pTL = { x: 0, y: 0 }, pBR = { x: 0, y: 0 }, pTR = { x: 0, y: 0 }, pBL = { x: 0, y: 0 };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== bestId) continue;
      const s = x + y,
        d = x - y;
      if (s < tl) { tl = s; pTL = { x, y }; }
      if (s > br) { br = s; pBR = { x, y }; }
      if (d > tr) { tr = d; pTR = { x, y }; }
      if (d < bl) { bl = d; pBL = { x, y }; }
    }
  const q: Quad = [pTL, pTR, pBR, pBL].map((pt) => ({
    x: (pt.x + 0.5) / w,
    y: (pt.y + 0.5) / h,
  })) as Quad;
  const area =
    Math.abs(
      q[0].x * q[1].y - q[1].x * q[0].y +
        (q[1].x * q[2].y - q[2].x * q[1].y) +
        (q[2].x * q[3].y - q[3].x * q[2].y) +
        (q[3].x * q[0].y - q[0].x * q[3].y),
    ) / 2;
  // Casi toda la foto ya es la hoja: no hay nada que recortar (y se evita comerse unos píxeles del borde).
  return area < 0.12 || area > 0.985 ? null : q;
}

// Esquinas puestas a mano: dentro de la imagen, sin cruzarse (convexo) y con área razonable.
export function validQuad(q: Quad): boolean {
  if (q.some((p) => !(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1))) return false;
  let sign = 0,
    area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4],
      c = q[(i + 2) % 4],
      cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
    area += a.x * b.y - b.x * a.y;
  }
  return sign > 0 && Math.abs(area) / 2 >= 0.05;
}

// Endereza el documento: lleva el cuadrilátero a un rectángulo (corrige perspectiva).
export function warp(p: Pixels, q: Quad): Pixels {
  assertPixels(p);
  const P = q.map((pt) => ({ x: pt.x * p.width, y: pt.y * p.height })),
    dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y),
    dw = Math.round(Math.max(dist(P[0], P[1]), dist(P[3], P[2]))),
    dh = Math.round(Math.max(dist(P[0], P[3]), dist(P[1], P[2])));
  if (dw < 8 || dh < 8 || dw > 4000 || dh > 4000)
    throw Error("Las esquinas del documento no son válidas.");
  const [x0, x1, x2, x3] = P.map((pt) => pt.x),
    [y0, y1, y2, y3] = P.map((pt) => pt.y),
    sx = x0 - x1 + x2 - x3,
    sy = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number, g = 0, hh = 0;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0;
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2,
      den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-9) throw Error("Las esquinas del documento no son válidas.");
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3;
    d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3;
  }
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let j = 0; j < dh; j++) {
    const v = (j + 0.5) / dh;
    for (let i = 0; i < dw; i++) {
      const u = (i + 0.5) / dw,
        k = g * u + hh * v + 1,
        sxp = Math.min(p.width - 1, Math.max(0, (a * u + b * v + x0) / k - 0.5)),
        syp = Math.min(p.height - 1, Math.max(0, (d * u + e * v + y0) / k - 0.5)),
        ix = Math.floor(sxp), iy = Math.floor(syp),
        fx = sxp - ix, fy = syp - iy,
        ix2 = Math.min(p.width - 1, ix + 1), iy2 = Math.min(p.height - 1, iy + 1),
        o = (j * dw + i) * 4;
      for (let c = 0; c < 4; c++) {
        const top = p.data[(iy * p.width + ix) * 4 + c] * (1 - fx) + p.data[(iy * p.width + ix2) * 4 + c] * fx,
          bot = p.data[(iy2 * p.width + ix) * 4 + c] * (1 - fx) + p.data[(iy2 * p.width + ix2) * 4 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { data: out, width: dw, height: dh };
}

export async function scanPdf(
  pages: PdfPage[],
  size: PageSize,
  title: string,
  layout: PageLayout = DEFAULT_LAYOUT,
): Promise<Blob> {
  if (!pages.length) throw Error("Agrega al menos una imagen.");
  if (!isColor(layout.background) || !isColor(layout.frameColor) || !(layout.margin in MARGIN_PT) || !(layout.frame in FRAME_PT))
    throw Error("Las opciones de la hoja no son válidas.");
  if (pages.length > MAX_PAGES) throw Error("Máximo " + MAX_PAGES + " páginas.");
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const pg of pages) {
    if (!(pg.width > 0 && pg.height > 0 && pg.jpeg.length)) throw Error("Imagen no válida.");
    const landscape = pg.width > pg.height;
    let pw: number, ph: number;
    const margin = MARGIN_PT[layout.margin];
    if (size === "fit") {
      const k = Math.min(1, 842 / Math.max(pg.width, pg.height) / 0.75) * 0.75;
      pw = pg.width * k + 2 * margin;
      ph = pg.height * k + 2 * margin;
    } else {
      const [a, b] = size === "a4" ? [595.28, 841.89] : [612, 792];
      pw = landscape ? b : a;
      ph = landscape ? a : b;
    }
    const scale = Math.min((pw - 2 * margin) / pg.width, (ph - 2 * margin) / pg.height),
      iw = pg.width * scale,
      ih = pg.height * scale,
      orientation = pw > ph ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "pt", format: [pw, ph], orientation });
    else pdf.addPage([pw, ph], orientation);
    if (layout.background.toLowerCase() !== "#ffffff") {
      pdf.setFillColor(...rgb(layout.background));
      pdf.rect(0, 0, pw, ph, "F");
    }
    const x = (pw - iw) / 2,
      y = (ph - ih) / 2;
    pdf.addImage(pg.jpeg, "JPEG", x, y, iw, ih);
    if (layout.frame !== "none") {
      const lw = FRAME_PT[layout.frame];
      pdf.setDrawColor(...rgb(layout.frameColor));
      pdf.setLineWidth(lw);
      pdf.rect(x + lw / 2, y + lw / 2, iw - lw, ih - lw, "S");
    }
  }
  pdf!.setProperties({ title: title.slice(0, 160) });
  return pdf!.output("blob");
}
