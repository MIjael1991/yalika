// Lado de la pantalla del reconocimiento de voz: elige el modelo según el dispositivo y habla con el trabajador.
// El modelo se descarga una sola vez (queda en el navegador) y después funciona sin internet.
import type { Piece } from "./yalika-transcript";

export type Tier = "rapido" | "preciso" | "maximo";
export type TierInfo = {
  id: Tier;
  label: string;
  model: string;
  size: string; // descarga aproximada, solo una vez
  hint: string;
  gpuOnly: boolean;
  gpuDtype: Record<string, string>;
};
export const TIERS: TierInfo[] = [
  {
    id: "rapido",
    label: "Rápido",
    model: "onnx-community/whisper-base",
    size: "unos 150 MB",
    hint: "Para borradores y audios claros. Se equivoca más con ruido o acentos fuertes.",
    gpuOnly: false,
    gpuDtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
  },
  {
    id: "preciso",
    label: "Preciso (recomendado)",
    model: "onnx-community/whisper-small",
    size: "unos 450 MB",
    hint: "Buen equilibrio: exacto con voz clara y razonable con ruido.",
    gpuOnly: false,
    gpuDtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
  },
  {
    id: "maximo",
    label: "Máxima precisión",
    model: "onnx-community/whisper-large-v3-turbo",
    size: "más de 1 GB",
    hint: "El más exacto, sobre todo con ruido y varios acentos. Pide una computadora con tarjeta gráfica moderna.",
    gpuOnly: true,
    gpuDtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
  },
];

export const LANGUAGES: [string, string][] = [
  ["spanish", "Español"],
  ["english", "Inglés"],
  ["portuguese", "Portugués"],
  ["french", "Francés"],
  ["italian", "Italiano"],
  ["german", "Alemán"],
  ["catalan", "Catalán"],
  ["", "Detectar el idioma solo"],
];

export type AsrRequest =
  | { type: "load"; model: string; device: "webgpu" | "wasm"; gpuDtype: Record<string, string> }
  | { type: "run"; id: string; audio: Float32Array; language: string | null }
  | { type: "close" };
export type AsrReply =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device: "webgpu" | "wasm"; note?: string }
  | { type: "result"; id: string; pieces: Piece[]; confidence?: number; words?: number[] }
  | { type: "error"; id?: string; message: string };

export type AsrEngine = {
  device: "webgpu" | "wasm";
  note?: string;
  run(audio: Float32Array, language: string | null): Promise<{ pieces: Piece[]; confidence?: number; words?: number[] }>;
  close(): void;
};

export async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

const friendly = (message: string) =>
  /fetch|network|load failed|failed to load|NetworkError|Unauthorized|404|403/i.test(message)
    ? "No se pudo descargar el modelo de voz. Revisa tu conexión a internet: se descarga una sola vez y después ya no la necesitas."
    : /memory|alloc|out of/i.test(message)
      ? "Este dispositivo se quedó sin memoria con este modelo. Prueba con el nivel «Rápido» o «Preciso»."
      : "No se pudo preparar el reconocimiento de voz: " + message;

export async function openAsr(tier: Tier, onDownload: (loaded: number, total: number) => void): Promise<AsrEngine> {
  const info = TIERS.find((t) => t.id === tier)!,
    gpu = await hasWebGpu();
  if (info.gpuOnly && !gpu) throw Error("La máxima precisión necesita una tarjeta gráfica con WebGPU (Chrome o Edge recientes en computadora). Usa «Preciso».");
  // Se pide al navegador que no borre el modelo descargado cuando falte espacio.
  void navigator.storage?.persist?.().catch(() => false);
  const worker = new Worker(new URL("./yalika-asr.worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<string, { ok(v: { pieces: Piece[]; confidence?: number; words?: number[] }): void; fail(e: Error): void }>();
  let ready: { ok(v: { device: "webgpu" | "wasm"; note?: string }): void; fail(e: Error): void } | null = null;
  worker.onmessage = (e: MessageEvent<AsrReply>) => {
    const m = e.data;
    if (m.type === "progress") onDownload(m.loaded, m.total);
    else if (m.type === "ready") ready?.ok({ device: m.device, note: m.note });
    else if (m.type === "result") waiting.get(m.id)?.ok({ pieces: m.pieces, confidence: m.confidence, words: m.words });
    else if (m.type === "error") {
      const err = Error(friendly(m.message));
      if (m.id) waiting.get(m.id)?.fail(err);
      else ready?.fail(err);
    }
  };
  worker.onerror = (e) => {
    const err = Error(friendly(e.message || "error del trabajador"));
    ready?.fail(err);
    for (const w of waiting.values()) w.fail(err);
  };
  const post = (m: AsrRequest, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  const state = await new Promise<{ device: "webgpu" | "wasm"; note?: string }>((ok, fail) => {
    ready = { ok, fail };
    post({ type: "load", model: info.model, device: gpu ? "webgpu" : "wasm", gpuDtype: info.gpuDtype });
  }).catch((e) => {
    worker.terminate();
    throw e;
  });
  let n = 0;
  return {
    device: state.device,
    note: state.note,
    run(audio, language) {
      const id = String(++n);
      return new Promise((ok, fail) => {
        waiting.set(id, { ok, fail });
        post({ type: "run", id, audio, language }, [audio.buffer]);
      }).finally(() => waiting.delete(id)) as Promise<{ pieces: Piece[]; confidence?: number; words?: number[] }>;
    },
    close() {
      post({ type: "close" });
      worker.terminate();
    },
  };
}
