/// <reference lib="webworker" />
// Motor de voz a texto (Whisper) dentro de un trabajador del navegador: la pantalla no se congela
// y el audio nunca sale del dispositivo. Solo se descarga el modelo una vez; después queda guardado.
import { LogitsProcessor, env, pipeline, type Tensor } from "@huggingface/transformers";
import type { AsrRequest, AsrReply } from "./yalika-asr";

type Chunk = { text: string; timestamp: [number, number | null] };
type Tokenizer = { timestamp_begin?: number; decode(ids: number[], options?: Record<string, unknown>): string };
type Transcriber = ((audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: Chunk[] }>) & {
  tokenizer?: Tokenizer;
  dispose?: () => Promise<void>;
};

// Mide qué tan seguro estaba el modelo de cada palabra que escribió (probabilidad de la opción elegida).
class Probe extends LogitsProcessor {
  sum = 0;
  count = 0;
  readonly ids: number[] = [];
  readonly logs: number[] = [];
  private readonly begin: number;
  constructor(begin: number) {
    super();
    this.begin = begin;
  }
  _call(_ids: bigint[][], logits: Tensor) {
    try {
      const vocab = logits.dims[logits.dims.length - 1],
        d = logits.data as unknown as ArrayLike<number>;
      let max = -Infinity,
        at = 0;
      for (let i = 0; i < vocab; i++)
        if (d[i] > max) {
          max = d[i];
          at = i;
        }
      if (at < 50257 /* texto, no símbolos especiales */) {
        let total = 0,
          marks = 0;
        for (let i = 0; i < vocab; i++) {
          const p = Math.exp(d[i] - max);
          total += p;
          if (i >= this.begin) marks += p;
        }
        // Los pasos en los que el modelo está escribiendo una marca de tiempo no cuentan.
        if (marks < total / 2) {
          this.sum += -Math.log(total); // log de la probabilidad más alta
          this.count++;
          this.ids.push(at);
          this.logs.push(-Math.log(total));
        }
      }
    } catch {
      /* si algo cambia en la biblioteca, simplemente no hay medida de seguridad */
    }
    return logits;
  }
}

let asr: Transcriber | null = null;
const send = (m: AsrReply) => (self as unknown as Worker).postMessage(m);
const total = new Map<string, { loaded: number; total: number }>();

function progress(p: { status?: string; file?: string; loaded?: number; total?: number }) {
  if (!p.file || (p.status !== "progress" && p.status !== "done" && p.status !== "initiate")) return;
  const prev = total.get(p.file) ?? { loaded: 0, total: 0 };
  if (p.status === "done") prev.loaded = prev.total || prev.loaded;
  else if (typeof p.loaded === "number" && typeof p.total === "number") {
    prev.loaded = p.loaded;
    prev.total = p.total;
  }
  total.set(p.file, prev);
  let loaded = 0,
    sum = 0;
  for (const v of total.values()) {
    loaded += v.loaded;
    sum += v.total;
  }
  send({ type: "progress", loaded, total: sum });
}

async function load(req: Extract<AsrRequest, { type: "load" }>) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const attempts: { device: "webgpu" | "wasm"; dtype: unknown; note?: string }[] = [];
  if (req.device === "webgpu") attempts.push({ device: "webgpu", dtype: req.gpuDtype });
  attempts.push({ device: "wasm", dtype: "q8", note: req.device === "webgpu" ? "La tarjeta gráfica no pudo con este modelo; se usa el procesador (más lento)." : undefined });
  let last: unknown = null;
  for (const a of attempts) {
    try {
      total.clear();
      const make = pipeline as unknown as (task: string, model: string, options: Record<string, unknown>) => Promise<Transcriber>;
      asr = await make("automatic-speech-recognition", req.model, { device: a.device, dtype: a.dtype, progress_callback: progress });
      send({ type: "ready", device: a.device, note: a.note });
      return;
    } catch (e) {
      last = e;
      asr = null;
    }
  }
  throw last ?? Error("No se pudo preparar el modelo.");
}

// Seguridad de cada palabra: promedio de la probabilidad de las partes (tokens) que la forman.
function wordProbs(tok: Tokenizer | undefined, ids: number[], logs: number[]): number[] | undefined {
  if (!tok || !ids.length) return undefined;
  try {
    const out: number[] = [];
    let cur: number[] = [];
    const flush = () => {
      if (cur.length) out.push(cur.reduce((a, b) => a + b, 0) / cur.length);
      cur = [];
    };
    ids.forEach((id, i) => {
      if (/^\s/.test(tok.decode([id], { skip_special_tokens: true }))) flush();
      cur.push(Math.exp(logs[i]));
    });
    flush();
    return out.map((v) => Math.round(v * 100) / 100);
  } catch {
    return undefined;
  }
}

async function run(req: Extract<AsrRequest, { type: "run" }>) {
  if (!asr) throw Error("El modelo no está listo.");
  const probe = new Probe(asr.tokenizer?.timestamp_begin ?? 50364);
  const options: Record<string, unknown> = {
    task: "transcribe",
    return_timestamps: true,
    logits_processor: [probe],
  };
  if (req.language) options.language = req.language;
  const out = await asr(req.audio, options);
  send({
    type: "result",
    id: req.id,
    pieces: (out.chunks ?? [{ text: out.text, timestamp: [0, null] as [number, number | null] }]).map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1], text: c.text })),
    confidence: probe.count ? Math.exp(-probe.sum / probe.count) : undefined,
    words: wordProbs(asr.tokenizer, probe.ids, probe.logs),
  });
}

self.onmessage = async (event: MessageEvent<AsrRequest>) => {
  const req = event.data;
  try {
    if (req.type === "load") await load(req);
    else if (req.type === "run") await run(req);
    else if (req.type === "close") {
      await asr?.dispose?.();
      asr = null;
    }
  } catch (e) {
    send({ type: "error", id: "id" in req ? req.id : undefined, message: e instanceof Error ? e.message : String(e) });
  }
};
