// Lee el audio de cualquier grabación o video (MP3, M4A, WAV, OGG, FLAC, MP4, MOV, WebM, MKV…) en el dispositivo
// y lo deja a 16 kHz en un solo canal, listo para reconocer. El archivo nunca se sube a ningún servidor.
import { EnergyMeter, HighPass, MAX_HOURS, PcmStore, RATE, Resampler, mixToMono } from "./yalika-audio";

export type Decoded = { pcm: PcmStore; frames: Float32Array; seconds: number };
export type DecodeProgress = (fraction: number) => void;

export const MEDIA_EXTENSIONS = /\.(mp3|m4a|aac|wav|wave|ogg|oga|opus|flac|weba|webm|mp4|m4v|mov|mkv|3gp|amr|aif|aiff|wma|avi)$/i;
export const isMedia = (f: { name: string; type: string }) => /^(audio|video)\//.test(f.type) || MEDIA_EXTENSIONS.test(f.name);

const LIMIT = RATE * 3600 * MAX_HOURS;
export const tooLong = () => Error(`La grabación dura más de ${MAX_HOURS} horas. Divídela en partes y transcribe cada una.`);

class Pipe {
  readonly pcm = new PcmStore();
  readonly meter = new EnergyMeter();
  private readonly hp = new HighPass();
  private rs: Resampler | null = null;
  rate = 0;
  feed(mono: Float32Array, rate: number) {
    if (!this.rs) {
      this.rs = new Resampler(rate);
      this.rate = rate;
    }
    this.take(this.rs.push(mono));
  }
  private take(x: Float32Array) {
    if (!x.length) return;
    if (this.pcm.length + x.length > LIMIT) throw tooLong();
    const y = this.hp.process(x);
    this.pcm.append(y);
    this.meter.push(y);
  }
  finish(): Decoded {
    if (this.rs) this.take(this.rs.flush());
    return { pcm: this.pcm, frames: this.meter.finish(), seconds: this.pcm.seconds };
  }
}

async function withMediabunny(file: File, onProgress: DecodeProgress, signal?: AbortSignal): Promise<Decoded | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw Error("Este archivo no tiene sonido. Si es un video, revisa que se haya grabado con audio.");
    if (!(await track.canDecode())) return null;
    const duration = await track.computeDuration();
    if (duration > MAX_HOURS * 3600) throw tooLong();
    const pipe = new Pipe(),
      sink = new mb.AudioSampleSink(track);
    for await (const sample of sink.samples()) {
      if (signal?.aborted) throw Error("Cancelado.");
      try {
        const channels: Float32Array[] = [];
        for (let c = 0; c < sample.numberOfChannels; c++) {
          const plane = new Float32Array(sample.numberOfFrames);
          sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
          channels.push(plane);
        }
        pipe.feed(mixToMono(channels), sample.sampleRate);
      } finally {
        sample.close();
      }
      if (duration > 0) onProgress(Math.min(1, sample.timestamp / duration));
    }
    return pipe.finish();
  } finally {
    input.dispose();
  }
}

// Plan B para archivos pequeños que el lector rápido no puede abrir: el decodificador del propio navegador.
async function withWebAudio(file: File, onProgress: DecodeProgress): Promise<Decoded> {
  if (file.size > 600 * 1024 * 1024) throw Error("Este archivo es muy grande para abrirlo así. Extrae el audio (por ejemplo a MP3) y vuelve a intentar.");
  const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw Error("Este navegador no puede leer audio. Prueba con Chrome, Edge o Safari actualizados.");
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > MAX_HOURS * 3600) throw tooLong();
    const pipe = new Pipe(),
      channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
      step = buffer.sampleRate * 10;
    for (let i = 0; i < buffer.length; i += step) {
      pipe.feed(mixToMono(channels.map((c) => c.subarray(i, i + step))), buffer.sampleRate);
      onProgress(Math.min(1, i / buffer.length));
      await new Promise((r) => setTimeout(r, 0));
    }
    return pipe.finish();
  } catch (e) {
    if (e instanceof Error && /decode|EncodingError|unable/i.test(e.message + e.name))
      throw Error("No se pudo leer este archivo. Puede estar dañado o usar un formato que tu navegador no abre; conviértelo a MP3 o WAV e inténtalo de nuevo.");
    throw e;
  } finally {
    void ctx.close();
  }
}

export async function decodeMedia(file: File, onProgress: DecodeProgress, signal?: AbortSignal): Promise<Decoded> {
  let failed: unknown = null;
  try {
    const fast = await withMediabunny(file, onProgress, signal);
    if (fast) return fast;
  } catch (e) {
    // Los errores que explican algo a la persona se muestran tal cual; los técnicos pasan al plan B.
    if (e instanceof Error && /sonido|horas|Cancelado/.test(e.message)) throw e;
    failed = e;
  }
  try {
    return await withWebAudio(file, onProgress);
  } catch (e) {
    if (failed && e instanceof Error && /No se pudo leer/.test(e.message)) throw Error("No se pudo leer el sonido de este archivo en tu navegador. Si es un video, prueba con Chrome o Edge; también puedes convertirlo a MP3 o WAV.");
    throw e;
  }
}
