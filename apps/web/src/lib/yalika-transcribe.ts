// Orquesta todo el trabajo de voz a texto: preparar el audio, partirlo en las pausas, escuchar cada bloque
// y armar el texto con sus partes dudosas. Recibe el lector de audio y el motor (para poder probarlo sin modelo).
import { audioNotes, gainFor, levels, planChunks, RATE, type AudioNotes, type Chunk, type Levels } from "./yalika-audio";
import { assemble, type ChunkResult, type Segment } from "./yalika-transcript";

export type Decoded = { pcm: { slice(from: number, to: number, gain?: number): Float32Array; peak?: number }; frames: Float32Array; seconds: number };
export type Engine = {
  device: "webgpu" | "wasm";
  note?: string;
  run(audio: Float32Array, language: string | null): Promise<{ pieces: { start: number; end: number | null; text: string }[]; confidence?: number; words?: number[] }>;
  close(): void;
};
export type Deps = {
  decode(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Decoded>;
  open(onDownload: (loaded: number, total: number) => void): Promise<Engine>;
};
export type Stage =
  | { stage: "leyendo"; fraction: number }
  | { stage: "modelo"; loaded: number; total: number }
  | { stage: "escuchando"; done: number; total: number; secondsDone: number; secondsTotal: number; eta: number | null; partial: Segment[] };
export type Outcome = {
  segments: Segment[];
  seconds: number;
  spoken: number;
  levels: Levels;
  notes: AudioNotes;
  device: "webgpu" | "wasm";
  engineNote?: string;
  missing: number; // bloques con voz que el modelo no pudo escribir
};
export type Options = { language: string | null; signal?: AbortSignal; onStage?(s: Stage): void };

const cancelled = () => Error("Cancelado.");

export async function transcribe(file: File, deps: Deps, opt: Options): Promise<Outcome> {
  const { signal, onStage } = opt;
  if (signal?.aborted) throw cancelled();
  onStage?.({ stage: "leyendo", fraction: 0 });
  const media = await deps.decode(file, (fraction) => onStage?.({ stage: "leyendo", fraction }), signal),
    lv = levels(media.frames),
    gain = gainFor(lv, media.pcm.peak),
    gainDb = 20 * Math.log10(gain),
    // Se mide el nivel de la voz ya con el volumen corregido: una grabación baja pero clara no es un problema.
    chunks = planChunks(media.frames).map((c) => ({ ...c, speechDb: c.speechDb + gainDb }));
  if (!chunks.length || media.seconds < 0.5) throw Error("No se oyó voz en esta grabación. Revisa que el volumen no esté en cero o que sea la grabación correcta.");
  const spoken = chunks.reduce((n, c) => n + (c.end - c.start), 0);
  onStage?.({ stage: "modelo", loaded: 0, total: 0 });
  let engine: Engine;
  try {
    engine = await deps.open((loaded, total) => onStage?.({ stage: "modelo", loaded, total }));
  } catch (e) {
    throw e instanceof Error ? e : Error("No se pudo preparar el modelo de voz.");
  }
  const results: ChunkResult[] = [],
    started = Date.now();
  let missing = 0,
    secondsDone = 0;
  try {
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw cancelled();
      const c = chunks[i],
        done = await listen(engine, media, c, gain, opt.language, signal);
      if (!done) {
        missing++;
        results.push({ chunk: c, pieces: [{ start: 0, end: c.end - c.start, text: "[…]" }], confidence: 0 });
      } else results.push({ chunk: c, ...done });
      secondsDone += c.end - c.start;
      const wall = (Date.now() - started) / 1000,
        eta = wall > 4 && secondsDone > 0 ? Math.max(0, (wall * (spoken - secondsDone)) / secondsDone) : null;
      onStage?.({ stage: "escuchando", done: i + 1, total: chunks.length, secondsDone, secondsTotal: spoken, eta, partial: assemble(results, { language: opt.language ?? undefined }) });
    }
  } finally {
    engine.close();
  }
  const segments = assemble(results, { language: opt.language ?? undefined }).map((s) =>
    s.text === "[…]" ? { ...s, doubt: ["No se pudo escribir esta parte; escúchala y escríbela a mano."] } : s,
  );
  return { segments, seconds: media.seconds, spoken, levels: lv, notes: audioNotes(lv, spoken, media.seconds), device: engine.device, engineNote: engine.note, missing };
}

// Si el modelo no estuvo seguro de un bloque (casi siempre por ruido), se vuelve a escuchar con el volumen más bajo y con un
// margen de silencio, y se queda con la versión de la que el modelo estuvo más seguro. Con audio claro nunca se activa.
export const RETRY_BELOW = 0.9;
const RETRY_GAIN = 0.03;
const PAD = 0.25;
const variants: { shift: number; make(a: Float32Array): Float32Array }[] = [
  { shift: 0, make: (a) => a.map((v) => Math.max(-1, Math.min(1, v * 0.6))) },
  {
    shift: PAD,
    make: (a) => {
      const out = new Float32Array(a.length + 2 * Math.round(PAD * RATE));
      out.set(a, Math.round(PAD * RATE));
      return out;
    },
  },
];

type Heard = { pieces: { start: number; end: number | null; text: string }[]; confidence?: number; words?: number[] };
const textOf = (h: Heard) => h.pieces.map((p) => p.text).join("").trim();

// Escucha un bloque; si sale vacío o falla con una voz clara, lo intenta de nuevo con otro margen antes de rendirse.
async function listen(engine: Engine, media: Decoded, c: Chunk, gain: number, language: string | null, signal?: AbortSignal) {
  const attempts: [number, number][] = [
    [0, 0],
    [-0.4, 0.4],
  ];
  for (let k = 0; k < attempts.length; k++) {
    const [a, b] = attempts[k],
      from = Math.max(0, Math.round((c.start + a) * RATE)),
      to = Math.min(Math.round(media.seconds * RATE), Math.round((c.end + b) * RATE)),
      shift = c.start - from / RATE,
      back = (h: Heard, extra = 0): Heard => ({ ...h, pieces: h.pieces.map((p) => ({ ...p, start: p.start - shift - extra, end: p.end === null ? null : p.end - shift - extra })) });
    try {
      const audio = media.pcm.slice(from, to, gain),
        out = await engine.run(audio, language);
      if (textOf(out) || c.snr < 6 || c.end - c.start < 1.5) {
        // Los tiempos se devuelven respecto al inicio original del bloque.
        let best = back(out);
        if (textOf(out) && out.confidence !== undefined && out.confidence < RETRY_BELOW) {
          for (const v of variants) {
            if (signal?.aborted) throw cancelled();
            try {
              const alt = await engine.run(v.make(audio), language);
              if (textOf(alt) && alt.confidence !== undefined && alt.confidence > (best.confidence ?? 0) + RETRY_GAIN) best = back(alt, v.shift);
            } catch (e) {
              if (e instanceof Error && /Cancelado|memoria|memory/i.test(e.message)) throw e;
            }
          }
        }
        return best;
      }
    } catch (e) {
      if (e instanceof Error && /Cancelado/.test(e.message)) throw e;
      if (k === attempts.length - 1) {
        if (e instanceof Error && /memoria|memory/i.test(e.message)) throw e;
        return null;
      }
    }
  }
  return null;
}
