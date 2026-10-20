// De lo que «escucha» el modelo a un texto confiable: limpieza, partes dudosas y archivos de salida.
// Funciones puras, sin red: se pueden probar y usar sin conexión.
import { MAX_CHARS, paragraph, type Paragraph, type YalikaDocument } from "./yalika-document";
import type { Chunk } from "./yalika-audio";

export type Piece = { start: number; end: number | null; text: string }; // tiempos dentro del bloque, en segundos
export type ChunkResult = {
  chunk: Chunk;
  pieces: Piece[];
  // Seguridad del modelo al escribir este bloque, de 0 a 1 (si el motor la puede medir).
  confidence?: number;
  // Seguridad (0 a 1) de cada palabra del bloque, en orden; solo se usa si coincide con el texto.
  words?: number[];
};
export type Segment = {
  start: number;
  end: number;
  text: string;
  doubt: string[]; // motivos por los que conviene revisarlo; vacío = sin dudas
  reviewed?: boolean;
  shaky?: string[]; // palabras en las que el modelo dudó; conviene escucharlas
};

export const SHAKY_WORD = 0.7; // por debajo de esto una palabra se marca como dudosa
export const WEAK_WORD = 0.35; // por debajo de esto la parte completa se manda a revisar
export const LOW_CONFIDENCE = 0.62;
export const MIN_SNR = 8;
export const QUIET_DB = -42;

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Frases que el modelo inventa cuando oye silencio, música o ruido (créditos de subtítulos y despedidas de video).
const CREDITS = [
  /amara\.?org/,
  /subtitulos? (realizados? )?por/,
  /subtitulado por/,
  /subtitulos? en espanol/,
  /traducido por/,
  /transcrito por/,
  /www [a-z0-9 ]+ (com|org|net)/,
  /subtitles? by/,
  /thanks for watching/,
  /sigue(me)? en (mis )?redes/,
];
const SIGN_OFFS = new Set([
  "gracias",
  "gracias por ver el video",
  "gracias por ver",
  "muchas gracias por ver este video",
  "gracias por mirar",
  "suscribete",
  "suscribete al canal",
  "hasta la proxima",
  "hasta luego",
  "adios",
  "chao",
  "thank you",
  "thanks",
  "bye",
  "musica",
  "aplausos",
  "risas",
  "you",
]);
export function isInvented(text: string, quiet: boolean): "credits" | "doubt" | null {
  const t = strip(text);
  if (!/[\p{L}\p{N}]/u.test(text)) return "credits";
  if (/^(musica|aplausos|risas|music|applause|silencio)$/.test(t) || /^[\s♪♫🎵\-–]*$/.test(text)) return "credits";
  if (CREDITS.some((re) => re.test(t))) return "credits";
  if (SIGN_OFFS.has(t)) return quiet ? "credits" : "doubt";
  return null;
}

// Quita bucles del modelo («sí sí sí sí sí…», la misma frase una y otra vez).
export function collapseRepeats(text: string): { text: string; changed: boolean } {
  let out = text,
    changed = false;
  // Una misma palabra o grupo corto repetido 4 o más veces seguidas.
  const loop = /(^|[\s,;¿¡])((?:[^\s,.;:!?¿¡]+[\s,]+){1,5}?)(?:\2){3,}/giu;
  const before = out;
  out = out.replace(loop, (_m, lead: string, unit: string) => lead + unit.trimEnd() + " ");
  if (out !== before) changed = true;
  // La misma oración 3 o más veces seguidas.
  const sentences = out.split(/(?<=[.!?…])\s+/);
  const kept: string[] = [];
  let run = 0;
  for (const s of sentences) {
    const last = kept[kept.length - 1];
    if (last !== undefined && strip(last) === strip(s) && strip(s)) {
      run++;
      if (run >= 2) {
        changed = true;
        continue; // la tercera copia en adelante se descarta
      }
    } else run = 0;
    kept.push(s);
  }
  out = kept.join(" ");
  return { text: out.replace(/\s+/g, " ").trim(), changed };
}

const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .trim();

// Caracteres que no corresponden a un idioma latino: señal de que el modelo «alucinó».
const FOREIGN = /[Ѐ-ӿ֐-ۿऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]/u;

export type AssembleOptions = { language?: string };
export function assemble(results: ChunkResult[], opt: AssembleOptions = {}): Segment[] {
  const out: Segment[] = [];
  const latin = !opt.language || ["spanish", "es", "english", "en", "portuguese", "pt", "french", "fr", "italian", "it", "german", "de", "catalan", "ca"].includes(opt.language.toLowerCase());
  for (const r of results) {
    const length = r.chunk.end - r.chunk.start,
      quiet = r.chunk.speechDb < QUIET_DB;
    // Cada pieza se lleva las palabras que le tocan; si la cuenta no cuadra, no se usa la medida por palabra.
    const counts = r.pieces.map((p) => (p.text.match(/\S+/g) ?? []).length),
      aligned = !!r.words && counts.reduce((a, b) => a + b, 0) === r.words.length;
    let cursor = 0;
    for (let i = 0; i < r.pieces.length; i++) {
      const p = r.pieces[i],
        probs = aligned ? r.words!.slice(cursor, cursor + counts[i]) : null,
        raw = probs ? (p.text.match(/\S+/g) ?? []) : [];
      cursor += counts[i];
      let text = tidy(p.text);
      if (!text) continue;
      const invented = isInvented(text, quiet || r.chunk.snr < MIN_SNR);
      if (invented === "credits") continue;
      const doubt: string[] = [];
      const loop = collapseRepeats(text);
      if (loop.changed) {
        text = loop.text;
        doubt.push("El modelo se repetía; se quitó lo repetido. Escucha si falta algo.");
      }
      if (!text) continue;
      if (invented === "doubt") doubt.push("Frase típica que el modelo inventa con silencio o ruido.");
      const start = r.chunk.start + Math.max(0, Math.min(p.start, length)),
        nextStart = r.pieces[i + 1]?.start,
        rawEnd = p.end ?? nextStart ?? length,
        end = r.chunk.start + Math.max(p.start, Math.min(rawEnd, length));
      const dur = Math.max(0.01, end - start);
      if (dur >= 2) {
        const cps = text.length / dur;
        if (cps > 32) doubt.push("Demasiado texto para ese tiempo: puede haber algo inventado.");
        else if (cps < 1.2 && text.length < 20) doubt.push("Muy poco texto para ese tiempo: puede faltar algo.");
      }
      if (latin && FOREIGN.test(text)) doubt.push("Trae letras de otro idioma: revísalo.");
      if (r.confidence !== undefined && r.confidence < LOW_CONFIDENCE) doubt.push("El modelo no estaba seguro de esta parte.");
      if (r.chunk.snr < MIN_SNR) doubt.push("Hay mucho ruido de fondo.");
      if (r.chunk.speechDb < QUIET_DB) doubt.push("La voz se oye muy baja.");
      const shaky: string[] = [];
      let weak = false;
      probs?.forEach((v, k) => {
        if (v >= SHAKY_WORD) return;
        const w = raw[k].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        if (!w) return;
        shaky.push(w);
        if (v < WEAK_WORD) weak = true;
      });
      if (weak || shaky.length >= 3) doubt.push("El modelo dudó en varias palabras (están marcadas abajo).");
      out.push({ start, end, text, doubt: [...new Set(doubt)], ...(shaky.length ? { shaky: [...new Set(shaky)] } : {}) });
    }
  }
  out.sort((a, b) => a.start - b.start);
  // Un mismo texto repetido en bloques vecinos casi siempre es un error del modelo.
  const dedup: Segment[] = [];
  for (const s of out) {
    const prev = dedup[dedup.length - 1];
    if (prev && strip(prev.text) === strip(s.text) && strip(s.text).length > 3 && s.start - prev.end < 1) {
      prev.end = Math.max(prev.end, s.end);
      prev.doubt = [...new Set([...prev.doubt, "Texto repetido en dos bloques seguidos."])];
      if (s.shaky?.length) prev.shaky = [...new Set([...(prev.shaky ?? []), ...s.shaky])];
      continue;
    }
    dedup.push(s);
  }
  return dedup;
}

export const hasDoubt = (s: Segment) => !s.reviewed && s.doubt.length > 0;
export function stats(segments: Segment[]) {
  const text = segments.map((s) => s.text).join(" "),
    words = (text.match(/\S+/g) ?? []).length,
    doubtful = segments.filter(hasDoubt).length;
  return { words, doubtful, segments: segments.length, duration: segments.length ? segments[segments.length - 1].end : 0 };
}

export function clock(sec: number, force = false) {
  const t = Math.max(0, Math.floor(sec)),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60,
    two = (n: number) => String(n).padStart(2, "0");
  return h || force ? `${two(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}
function stamp(sec: number, comma: boolean) {
  const ms = Math.max(0, Math.round(sec * 1000)),
    h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000),
    two = (n: number) => String(n).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)}${comma ? "," : "."}${String(ms % 1000).padStart(3, "0")}`;
}

export type Block = { start: number; text: string };
// Párrafos: se corta en una pausa larga o cuando el párrafo ya es muy largo y termina una oración.
export function paragraphs(segments: Segment[], pause = 1.6, soft = 650): Block[] {
  const out: Block[] = [];
  let prevEnd = 0;
  for (const s of segments) {
    const last = out[out.length - 1];
    if (!last || s.start - prevEnd >= pause || (last.text.length >= soft && /[.!?…]["»”)]*$/.test(last.text))) out.push({ start: s.start, text: s.text });
    else last.text += " " + s.text;
    prevEnd = s.end;
  }
  return out;
}

const mark = (s: Segment, doubts: boolean) => (doubts && hasDoubt(s) ? s.text + " [¿?]" : s.text);
export type TextOptions = { times?: boolean; doubts?: boolean };
export function toText(segments: Segment[], opt: TextOptions = {}) {
  const marked = segments.map((s) => ({ ...s, text: mark(s, !!opt.doubts) }));
  return paragraphs(marked)
    .map((p) => (opt.times ? `[${clock(p.start)}] ` : "") + p.text)
    .join("\n\n");
}

// Subtítulos: líneas cortas (máx. 42 letras, 2 líneas) y cada cuadro dura entre 1 y 7 segundos.
export type Cue = { start: number; end: number; text: string };
function wrap(text: string, width = 42): string {
  const words = text.split(" "),
    lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else line = line ? line + " " + w : w;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?…])\s+/);
  if (sentences.length > 1) return sentences.flatMap((s) => splitText(s, max));
  // Se busca la coma o el espacio más cercano a la mitad.
  const mid = text.length / 2;
  let best = -1,
    bestDist = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== " ") continue;
    const comma = /[,;:]/.test(text[i - 1]),
      d = Math.abs(i - mid) - (comma ? text.length * 0.15 : 0);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) return [text];
  return [...splitText(text.slice(0, best), max), ...splitText(text.slice(best + 1), max)];
}
export function toCues(segments: Segment[]): Cue[] {
  const cues: Cue[] = [];
  for (const s of segments) {
    const parts = splitText(s.text, 84),
      total = parts.reduce((n, p) => n + p.length, 0) || 1,
      span = Math.max(0.5, s.end - s.start);
    let t = s.start;
    for (const p of parts) {
      const d = (span * p.length) / total;
      cues.push({ start: t, end: Math.max(t + 0.8, Math.min(t + 7, t + d)), text: wrap(p) });
      t += d;
    }
  }
  // Ningún cuadro se encima con el siguiente.
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = Math.max(cues[i].start + 0.3, cues[i + 1].start - 0.02);
  return cues;
}
export function toSrt(segments: Segment[]) {
  return toCues(segments)
    .map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}\n`)
    .join("\n");
}
export function toVtt(segments: Segment[]) {
  return "WEBVTT\n\n" + toCues(segments).map((c) => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text}\n`).join("\n");
}

export type Meta = { title: string; source: string; duration: number; language: string; date: Date };
export type DocOptions = TextOptions;
// Documento para Word y PDF con el mismo modelo del editor: se puede abrir y seguir editando en Estudio.
export function toDocument(segments: Segment[], meta: Meta, opt: DocOptions = {}): YalikaDocument {
  const title = meta.title.slice(0, 150),
    head: Paragraph = { ...paragraph(title), size: 20, bold: true, align: "center" },
    info: Paragraph = {
      ...paragraph(
        `Transcripción de «${meta.source}» · duración ${clock(meta.duration)} · idioma ${meta.language} · ${meta.date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`,
      ),
      size: 10,
      italic: true,
      align: "center",
    };
  const marked = segments.map((s) => ({ ...s, text: mark(s, !!opt.doubts) }));
  // El editor admite hasta 1000 párrafos: en grabaciones muy largas se juntan los más cercanos.
  let blocks = paragraphs(marked),
    soft = 650,
    pause = 1.6;
  while (blocks.length > 950 && soft < 1e7) {
    soft *= 2;
    pause *= 1.6;
    blocks = paragraphs(marked, pause, soft);
  }
  const body = blocks.map((p) => paragraph((opt.times ? `[${clock(p.start)}] ` : "") + p.text));
  // El modelo de documento tiene tope de caracteres: se avisa en vez de cortar sin decir nada.
  let used = head.text.length + info.text.length;
  const kept: Paragraph[] = [];
  for (const p of body) {
    if (used + p.text.length > MAX_CHARS - 200) {
      kept.push({ ...paragraph("[El texto es muy largo para un solo documento; descarga también la versión en texto (.txt) para tenerlo completo.]"), italic: true });
      break;
    }
    used += p.text.length;
    kept.push(p);
  }
  return { version: 1, title, pageNumbers: true, paragraphs: [head, info, paragraph(), ...kept] };
}

export function replaceAll(segments: Segment[], from: string, to: string, matchCase = false): { segments: Segment[]; count: number } {
  if (!from) return { segments, count: 0 };
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    re = new RegExp(escaped, matchCase ? "g" : "gi");
  let count = 0;
  const next = segments.map((s) => {
    const t = s.text.replace(re, () => {
      count++;
      return to;
    });
    return t === s.text ? s : { ...s, text: t };
  });
  return { segments: next, count };
}

export const fileBase = (name: string) => name.replace(/\.[^.\\/]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "grabacion";

// Palabras dudosas que siguen en el texto (si la persona ya las corrigió, dejan de aparecer).
export function shakyIn(s: Segment): string[] {
  if (!s.shaky?.length) return [];
  const have = new Set((s.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).map((w) => w.toLowerCase()));
  return s.shaky.filter((w) => have.has(w.toLowerCase()));
}
