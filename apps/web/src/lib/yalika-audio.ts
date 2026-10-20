// Preparación del audio para reconocer voz con la mayor exactitud posible.
// Todo ocurre en el dispositivo: aquí solo hay cálculo sobre muestras, sin red ni almacenamiento.
export const RATE = 16000; // Whisper escucha a 16 kHz, un solo canal
export const FRAME = 320; // 20 ms por cuadro de energía
export const FRAME_SEC = FRAME / RATE;
export const MAX_CHUNK_SEC = 28; // Whisper trabaja en bloques de 30 s; se deja margen
export const MAX_HOURS = 3;

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length),
    k = 1 / channels.length;
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] * k;
  return out;
}

const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const LOBES = 10; // calidad del filtro: más lóbulos = menos distorsión y más cálculo
const STEPS = 128; // precisión de la tabla del filtro entre dos muestras

// Cambio de frecuencia de muestreo con filtro sinc con ventana (calidad de estudio), por tramos.
// Sirve para un archivo completo o para llegar pasando trozos seguidos con push() y terminando con flush().
export class Resampler {
  private tail = new Float32Array(0); // muestras ya recibidas que aún se necesitan
  private tailStart = 0; // posición de tail[0] en la entrada completa
  private next = 0; // posición (en muestras de entrada) de la siguiente salida
  private total = 0;
  private readonly step: number;
  private readonly cut: number;
  private readonly half: number;
  private readonly table: Float32Array;
  constructor(
    private readonly from: number,
    private readonly to = RATE,
  ) {
    if (!(from > 0) || !(to > 0)) throw Error("Frecuencia de audio no válida.");
    this.step = from / to;
    this.cut = Math.min(1, to / from) * 0.96;
    this.half = Math.ceil(LOBES / this.cut);
    const size = 2 * this.half * STEPS + 2;
    this.table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = i / STEPS - this.half,
        w = Math.abs(x) >= this.half ? 0 : 0.42 + 0.5 * Math.cos((Math.PI * x) / this.half) + 0.08 * Math.cos((2 * Math.PI * x) / this.half);
      this.table[i] = this.cut * sinc(this.cut * x) * w;
    }
  }
  push(input: Float32Array): Float32Array {
    return this.run(input, false);
  }
  flush(): Float32Array {
    return this.run(new Float32Array(0), true);
  }
  private run(input: Float32Array, last: boolean): Float32Array {
    if (this.from === this.to) {
      this.total += input.length;
      return input;
    }
    // Se une lo pendiente con lo nuevo y se calculan todas las salidas que ya tienen sus vecinas completas.
    const data = new Float32Array(this.tail.length + input.length);
    data.set(this.tail);
    data.set(input, this.tail.length);
    this.total += input.length;
    const base = this.tailStart,
      end = base + data.length,
      limit = last ? this.total : end - this.half,
      out: number[] = [];
    let pos = this.next;
    while (pos < limit) {
      const lo = Math.ceil(pos - this.half),
        hi = Math.floor(pos + this.half);
      let acc = 0;
      for (let n = lo; n <= hi; n++) {
        const idx = n - base;
        if (idx < 0 || idx >= data.length) continue; // fuera del archivo = silencio
        const t = (n - pos + this.half) * STEPS,
          i0 = t | 0,
          f = t - i0;
        acc += data[idx] * (this.table[i0] + (this.table[i0 + 1] - this.table[i0]) * f);
      }
      out.push(acc);
      pos += this.step;
    }
    this.next = pos;
    const keepFrom = Math.max(base, Math.floor(pos - this.half) - 1);
    this.tail = data.slice(keepFrom - base);
    this.tailStart = keepFrom;
    return Float32Array.from(out);
  }
}

export function resample(input: Float32Array, from: number, to = RATE): Float32Array {
  if (from === to) return input;
  const r = new Resampler(from, to),
    a = r.push(input),
    b = r.flush(),
    out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// Filtro que quita el zumbido grave y la corriente continua (segundo orden, 80 Hz), sin cambiar la voz.
export class HighPass {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;
  constructor(rate = RATE, cutoff = 80) {
    const w = (2 * Math.PI * cutoff) / rate,
      cos = Math.cos(w),
      alpha = Math.sin(w) / (2 * Math.SQRT1_2),
      a0 = 1 + alpha;
    this.b0 = (1 + cos) / 2 / a0;
    this.b1 = -(1 + cos) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x: Float32Array): Float32Array {
    const out = new Float32Array(x.length);
    let { x1, x2, y1, y2 } = this;
    for (let i = 0; i < x.length; i++) {
      const v = x[i],
        y = this.b0 * v + this.b1 * x1 + this.b2 * x2 - this.a1 * y1 - this.a2 * y2;
      x2 = x1;
      x1 = v;
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
    Object.assign(this, { x1, x2, y1, y2 });
    return out;
  }
}

// Todo el audio ya convertido (16 kHz, mono) en 16 bits: hasta 3 horas caben en unos 350 MB.
export class PcmStore {
  private data: Int16Array;
  length = 0;
  peak = 0; // la muestra más alta (0 a 1), para no recortar al subir el volumen
  constructor(capacity = RATE * 60) {
    this.data = new Int16Array(Math.max(RATE, capacity));
  }
  append(x: Float32Array) {
    if (this.length + x.length > this.data.length) {
      const grown = new Int16Array(Math.max(this.data.length * 2, this.length + x.length));
      grown.set(this.data.subarray(0, this.length));
      this.data = grown;
    }
    for (let i = 0; i < x.length; i++) {
      const v = Math.round(x[i] * 32767);
      const a = Math.abs(v) / 32767;
      if (a > this.peak) this.peak = a;
      this.data[this.length + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
    this.length += x.length;
  }
  slice(from: number, to: number, gain = 1): Float32Array {
    const a = Math.max(0, from),
      b = Math.min(this.length, to),
      out = new Float32Array(Math.max(0, b - a));
    for (let i = 0; i < out.length; i++) out[i] = (this.data[a + i] / 32768) * gain;
    return out;
  }
  get seconds() {
    return this.length / RATE;
  }
}

// Energía (RMS) de cada tramo de 20 ms, calculada mientras llega el audio.
export class EnergyMeter {
  readonly frames: number[] = [];
  private carry = new Float32Array(0);
  push(x: Float32Array) {
    let data = x;
    if (this.carry.length) {
      data = new Float32Array(this.carry.length + x.length);
      data.set(this.carry);
      data.set(x, this.carry.length);
    }
    let i = 0;
    for (; i + FRAME <= data.length; i += FRAME) {
      let s = 0;
      for (let j = i; j < i + FRAME; j++) s += data[j] * data[j];
      this.frames.push(Math.sqrt(s / FRAME));
    }
    this.carry = data.slice(i);
  }
  finish(): Float32Array {
    if (this.carry.length >= FRAME / 4) {
      let s = 0;
      for (const v of this.carry) s += v * v;
      this.frames.push(Math.sqrt(s / this.carry.length));
    }
    this.carry = new Float32Array(0);
    return Float32Array.from(this.frames);
  }
}

const db = (rms: number) => 20 * Math.log10(rms + 1e-9);
const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

export type Levels = {
  floorDb: number; // ruido de fondo
  speechDb: number; // nivel de la voz
  snr: number; // cuánto sobresale la voz del ruido, en dB
  threshold: number; // por encima de esto se considera voz
  peakDb: number;
};
export function levels(frames: Float32Array): Levels {
  if (!frames.length) return { floorDb: -90, speechDb: -90, snr: 0, threshold: -60, peakDb: -90 };
  const d = Array.from(frames, db).sort((a, b) => a - b),
    floor = Math.max(percentile(d, 0.1), -75),
    speech = percentile(d, 0.95),
    peakDb = d[d.length - 1];
  // Más abajo que la voz por una cuarta parte de la distancia al ruido, y nunca a más de 30 dB de ella.
  // Si casi todo es voz seguida (sin silencios), el umbral nunca sube hasta la propia voz.
  const threshold = Math.max(Math.min(Math.max(floor + 0.3 * (speech - floor), speech - 30, -62), speech - 8), -72);
  return { floorDb: floor, speechDb: speech, snr: speech - floor, threshold, peakDb };
}

export type Region = { start: number; end: number }; // en cuadros de 20 ms, fin no incluido
// Zonas con voz: une pausas cortas (respirar, comas) y descarta chasquidos sueltos.
export function speechRegions(frames: Float32Array, lv = levels(frames), hang = 0.45, minLen = 0.2): Region[] {
  const gap = Math.round(hang / FRAME_SEC),
    min = Math.round(minLen / FRAME_SEC),
    raw: Region[] = [];
  let open = -1;
  for (let i = 0; i <= frames.length; i++) {
    const on = i < frames.length && db(frames[i]) > lv.threshold;
    if (on && open < 0) open = i;
    if (!on && open >= 0) {
      raw.push({ start: open, end: i });
      open = -1;
    }
  }
  const merged: Region[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= gap) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged.filter((r) => {
    if (r.end - r.start >= min) return true;
    let peak = -120;
    for (let i = r.start; i < r.end; i++) peak = Math.max(peak, db(frames[i]));
    return peak > lv.threshold + 12; // una sílaba corta pero fuerte sí cuenta
  });
}

export type Chunk = {
  start: number; // segundos
  end: number;
  speechDb: number;
  snr: number;
};
// Cuadro más callado cerca del límite para cortar sin partir una palabra.
function quietest(smooth: Float32Array, from: number, to: number) {
  let best = to,
    low = Infinity;
  for (let i = to; i >= from; i--)
    if (smooth[i] < low - 1e-9) {
      low = smooth[i];
      best = i;
    }
  return best;
}
function smoothed(frames: Float32Array) {
  const out = new Float32Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    let s = 0,
      n = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(frames.length - 1, i + 3); j++) {
      s += frames[j];
      n++;
    }
    out[i] = s / n;
  }
  return out;
}
// Reparte el audio en bloques de hasta ~28 s que empiezan y terminan en pausas, y deja fuera los silencios largos.
export function planChunks(frames: Float32Array, opt: { max?: number; pad?: number; split?: number } = {}): Chunk[] {
  const max = Math.round((opt.max ?? MAX_CHUNK_SEC) / FRAME_SEC),
    pad = Math.round((opt.pad ?? 0.3) / FRAME_SEC),
    split = Math.round((opt.split ?? 2.0) / FRAME_SEC),
    lv = levels(frames),
    regions = speechRegions(frames, lv),
    sm = smoothed(frames);
  if (!regions.length) return [];
  // 1) Zonas demasiado largas se parten en la pausa más clara cercana al límite.
  const pieces: Region[] = [];
  for (const r of regions) {
    let a = r.start;
    while (r.end - a > max) {
      const cut = quietest(sm, a + Math.round(max * 0.6), a + max - 1);
      pieces.push({ start: a, end: cut });
      a = cut;
    }
    pieces.push({ start: a, end: r.end });
  }
  // 2) Se juntan zonas contiguas mientras quepan y la pausa entre ellas sea corta.
  const groups: Region[] = [];
  for (const p of pieces) {
    const g = groups[groups.length - 1];
    if (g && p.start - g.end < split && p.end - g.start + 2 * pad <= max) g.end = p.end;
    else groups.push({ ...p });
  }
  // 3) Margen a cada lado sin invadir al vecino.
  const out: Chunk[] = [];
  groups.forEach((g, i) => {
    const prev = groups[i - 1],
      nextG = groups[i + 1],
      a = Math.max(prev ? Math.floor((prev.end + g.start) / 2) : 0, g.start - pad),
      b = Math.min(nextG ? Math.ceil((nextG.start + g.end) / 2) : frames.length, g.end + pad);
    let level = 0,
      n = 0;
    for (let k = g.start; k < g.end; k++) {
      level += frames[k] * frames[k];
      n++;
    }
    const speechDb = db(Math.sqrt(level / Math.max(1, n)));
    out.push({ start: a * FRAME_SEC, end: b * FRAME_SEC, speechDb, snr: speechDb - lv.floorDb });
  });
  return out;
}

// Cuánto subir el volumen para que la voz quede clara sin que se recorte.
export function gainFor(lv: Levels, samplePeak = 0): number {
  const room = -1 - Math.max(lv.peakDb, samplePeak > 0 ? db(samplePeak) : -120), // dB libres hasta el máximo
    want = -20 - lv.speechDb;
  return 10 ** (Math.max(0, Math.min(want, room, 30)) / 20);
}

export type AudioNotes = { tooQuiet: boolean; noisy: boolean; mostlySilent: boolean };
export function audioNotes(lv: Levels, spoken: number, total: number): AudioNotes {
  return { tooQuiet: lv.speechDb < -45, noisy: lv.snr < 12, mostlySilent: total > 0 && spoken / total < 0.05 };
}
