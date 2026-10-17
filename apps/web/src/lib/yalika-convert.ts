// Convertidor único: de casi cualquier archivo a casi cualquier formato, todo en el dispositivo.
// Aquí vive el mapa «de qué a qué» y la conversión; la pantalla solo elige archivo y destino.
import { documentName, exportPdf, exportWord, type YalikaDocument } from "./yalika-document";
import {
  MAX_IMPORT_BYTES,
  importDocument,
  importOcr,
  importPptx,
  isScannedPdf,
  type ImportResult,
} from "./yalika-import";
import { DEFAULT_LAYOUT, MAX_PAGES, type PageLayout, type PageSize, type ScanMode } from "./yalika-scan";
import { importCsv, importXlsx, sheetCsv, sheetPdf } from "./yalika-sheet";
import { zipImages, type PageImage } from "./yalika-zip";
export type Kind = "pdf" | "word" | "excel" | "csv" | "powerpoint" | "imagen" | "texto";
export type TargetId = "word" | "pdf" | "texto" | "jpg" | "png" | "csv";
export type Target = { id: TargetId; label: string; hint: string };
export type Source = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> };
export type Output = { blob: Blob; name: string; detail: string; warning: string };
export type ConvertOptions = { dpi: 150 | 220; size: PageSize; layout: PageLayout; style: ScanMode };
export const DEFAULT_OPTIONS: ConvertOptions = { dpi: 150, size: "a4", layout: DEFAULT_LAYOUT, style: "color" };
export const KIND_LABEL: Record<Kind, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  csv: "CSV",
  powerpoint: "PowerPoint",
  imagen: "Imagen",
  texto: "Texto",
};
const T = (id: TargetId, label: string, hint: string): Target => ({ id, label, hint });
const WORD = T("word", "Word (.docx)", "Texto que puedes editar. Si el PDF es un escaneo, se reconoce el texto solo.");
const TEXT = T("texto", "Texto (.txt)", "Solo el texto, sin formato.");
const TARGETS: Record<Kind, Target[]> = {
  pdf: [
    WORD,
    TEXT,
    T("jpg", "Imágenes JPG", "Una imagen por página (ZIP si son varias). Pesan poco."),
    T("png", "Imágenes PNG", "Una imagen por página, sin pérdida de calidad."),
  ],
  word: [T("pdf", "PDF", "Conserva el texto y el formato básico; no tablas ni imágenes."), TEXT],
  texto: [T("pdf", "PDF", "Un PDF con tu texto."), WORD],
  powerpoint: [
    T("pdf", "PDF", "El texto de las diapositivas, una tras otra."),
    WORD,
    TEXT,
  ],
  excel: [
    T("pdf", "PDF", "Las hojas como tablas; solo valores, sin colores ni fórmulas."),
    T("csv", "CSV", "Una hoja = un CSV (ZIP si hay varias)."),
  ],
  csv: [T("pdf", "PDF", "La tabla en un PDF.")],
  imagen: [
    T("pdf", "PDF", "Se mejoran solas: sombras, bordes y enderezado. Varias fotos = varias páginas."),
    T("word", "Word (.docx)", "Reconoce el texto de la foto para que lo edites."),
    TEXT,
    T("jpg", "JPG", "Cambia el formato de la imagen."),
    T("png", "PNG", "Cambia el formato de la imagen."),
  ],
};
export const targetsFor = (k: Kind) => TARGETS[k];
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
// Qué tipo de archivo es; si no se puede convertir, dice por qué.
export function classify(f: { name: string; type: string }): { kind: Kind | null; problem: string } {
  const n = f.name.toLowerCase();
  const ok = (kind: Kind) => ({ kind, problem: "" });
  if (/\.pdf$/.test(n)) return ok("pdf");
  if (/\.docx$/.test(n)) return ok("word");
  if (/\.xlsx$/.test(n)) return ok("excel");
  if (/\.(csv|tsv)$/.test(n)) return ok("csv");
  if (/\.pptx$/.test(n)) return ok("powerpoint");
  if (/\.(txt|md)$/.test(n)) return ok("texto");
  if (f.type.startsWith("image/") || IMAGE_EXT.test(n)) return ok("imagen");
  const old = /\.(doc|xls|ppt)$/.exec(n)?.[1];
  if (old) {
    const now = { doc: "Word (.docx)", xls: "Excel (.xlsx)", ppt: "PowerPoint (.pptx)" }[old];
    return { kind: null, problem: "«" + f.name + "» es un formato antiguo. Ábrelo y guárdalo como " + now + "." };
  }
  return { kind: null, problem: "«" + f.name + "»: este tipo de archivo todavía no se puede convertir." };
}
const baseName = (name: string) => documentName(name.replace(/\.[^.]+$/, ""));
const safe = (s: string) => s.replace(/[\u0000-\u001f\\/:*?"<>|]/g, "-").trim().slice(0, 60) || "hoja";
const plural = (n: number, one: string, many: string) => n + " " + (n === 1 ? one : many);
const text = (doc: YalikaDocument) => "﻿" + doc.paragraphs.map((p) => p.text).join("\n\n");
async function fromDocument(r: ImportResult, target: TargetId, base: string): Promise<Output> {
  const detail = plural(r.doc.paragraphs.length, "párrafo", "párrafos");
  if (target === "word") return { blob: await exportWord(r.doc), name: base + ".docx", detail, warning: r.warning };
  if (target === "pdf") return { blob: await exportPdf(r.doc), name: base + ".pdf", detail, warning: r.warning };
  return { blob: new Blob([text(r.doc)], { type: "text/plain;charset=utf-8" }), name: base + ".txt", detail, warning: r.warning };
}
// Reconoce el texto página por página sin guardar todas las páginas en memoria.
async function ocr(
  run: (each: (canvas: HTMLCanvasElement) => Promise<void>) => Promise<void>,
  base: string,
  say: (m: string) => void,
): Promise<ImportResult> {
  const { openOcr } = await import("./yalika-ocr");
  say("Preparando el reconocimiento de texto…");
  const engine = await openOcr(),
    texts: string[] = [];
  let sum = 0;
  try {
    await run(async (canvas) => {
      say("Reconociendo texto de la página " + (texts.length + 1) + "…");
      const r = await engine.recognize(canvas);
      texts.push(r.text);
      sum += r.confidence;
    });
  } finally {
    await engine.close();
  }
  return importOcr(base, texts, sum / Math.max(1, texts.length));
}
async function prepared(file: File, o: ConvertOptions) {
  const { decode } = await import("./yalika-image-io"),
    { MAX_SIDE, PREVIEW_SIDE, NO_MARGINS, detectDocument, processPixels } = await import("./yalika-scan");
  const px = await decode(file, MAX_SIDE),
    quad = o.style === "original" ? null : detectDocument(await decode(file, PREVIEW_SIDE));
  return processPixels(px, { mode: o.style, turns: 0, margins: NO_MARGINS, quad });
}
async function fromImages(files: File[], target: TargetId, o: ConvertOptions, base: string, say: (m: string) => void): Promise<Output> {
  const io = await import("./yalika-image-io");
  if (target === "pdf") {
    if (files.length > MAX_PAGES) throw Error("Máximo " + MAX_PAGES + " fotos por PDF. Haz varios y únelos en «Unir PDF».");
    const pages = [];
    for (const [i, f] of files.entries()) {
      say("Mejorando foto " + (i + 1) + " de " + files.length + "…");
      const px = await prepared(f, o);
      pages.push({ jpeg: await io.toBytes(px, "image/jpeg"), width: px.width, height: px.height });
    }
    const { scanPdf } = await import("./yalika-scan");
    return { blob: await scanPdf(pages, o.size, base, o.layout), name: base + ".pdf", detail: plural(pages.length, "página", "páginas"), warning: "" };
  }
  if (target === "jpg" || target === "png") {
    const type = target === "jpg" ? "image/jpeg" : "image/png",
      out: PageImage[] = [];
    for (const [i, f] of files.entries()) {
      say("Convirtiendo imagen " + (i + 1) + " de " + files.length + "…");
      out.push({ name: baseName(f.name) + "." + target, bytes: await io.toBytes(await io.decode(f, 6000), type, 0.92) });
    }
    if (out.length === 1) return { blob: new Blob([out[0].bytes as BlobPart], { type }), name: out[0].name, detail: "1 imagen", warning: "" };
    const names = new Set<string>();
    const unique = out.map((x, i) => ({ ...x, name: names.has(x.name) ? String(i + 1) + "-" + x.name : (names.add(x.name), x.name) }));
    return { blob: new Blob([zipImages(unique) as BlobPart], { type: "application/zip" }), name: base + "-imagenes.zip", detail: plural(out.length, "imagen", "imágenes"), warning: "" };
  }
  const { MAX_OCR_PAGES } = await import("./yalika-ocr");
  if (files.length > MAX_OCR_PAGES) throw Error("Para reconocer texto usa " + MAX_OCR_PAGES + " fotos o menos.");
  const run = async (each: (c: HTMLCanvasElement) => Promise<void>) => {
    for (const f of files) {
      const c = document.createElement("canvas");
      io.toCanvas(await prepared(f, o), c);
      await each(c);
    }
  };
  return fromDocument(await ocr(run, base, say), target, base);
}
async function fromPdf(file: Source, target: TargetId, o: ConvertOptions, base: string, say: (m: string) => void): Promise<Output> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (target === "jpg" || target === "png") {
    const { pdfToImages } = await import("./yalika-pdf-images");
    const out = await pdfToImages(bytes, o.dpi, target === "jpg" ? "jpeg" : "png", base, (d, t) =>
      say("Convirtiendo página " + Math.min(d + 1, t) + " de " + t + "…"),
    );
    const type = target === "jpg" ? "image/jpeg" : "image/png";
    if (out.length === 1) return { blob: new Blob([out[0].bytes as BlobPart], { type }), name: out[0].name, detail: "1 imagen", warning: "" };
    return { blob: new Blob([zipImages(out) as BlobPart], { type: "application/zip" }), name: base + "-imagenes.zip", detail: plural(out.length, "imagen", "imágenes"), warning: "" };
  }
  try {
    return await fromDocument(await importDocument(file), target, base);
  } catch (e) {
    if (!isScannedPdf(e)) throw e;
    const { MAX_OCR_PAGES } = await import("./yalika-ocr");
    const { renderPdf } = await import("./yalika-pdf-images");
    const run = (each: (c: HTMLCanvasElement) => Promise<void>) => renderPdf(bytes, 200, MAX_OCR_PAGES, (canvas) => each(canvas));
    return fromDocument(await ocr(run, base, say), target, base);
  }
}
export async function convert(
  files: Source[],
  target: TargetId,
  o: ConvertOptions = DEFAULT_OPTIONS,
  say: (message: string) => void = () => {},
): Promise<Output> {
  if (!files.length) throw Error("Elige un archivo.");
  const kinds = files.map(classify),
    bad = kinds.find((k) => !k.kind);
  if (bad) throw Error(bad.problem);
  const kind = kinds[0].kind!;
  if (kinds.some((k) => k.kind !== kind)) throw Error("Elige archivos del mismo tipo.");
  if (!targetsFor(kind).some((t) => t.id === target)) throw Error("Ese cambio de formato no está disponible para este archivo.");
  if (files.length > 1 && kind !== "imagen") throw Error("Aquí se convierte un archivo a la vez. Para juntar varios PDF usa «Unir PDF».");
  for (const f of files) {
    if (!f.size) throw Error("«" + f.name + "» está vacío.");
    if (f.size > MAX_IMPORT_BYTES) throw Error("«" + f.name + "» pesa más de 20 MB.");
  }
  const file = files[0],
    base = files.length > 1 ? "Imágenes convertidas" : baseName(file.name);
  say("Convirtiendo…");
  if (kind === "imagen") return fromImages(files as File[], target, o, base, say);
  if (kind === "pdf") return fromPdf(file, target, o, base, say);
  if (kind === "powerpoint") return fromDocument(importPptx(file.name, new Uint8Array(await file.arrayBuffer())), target, base);
  if (kind === "word" || kind === "texto") return fromDocument(await importDocument(file), target, base);
  const r = kind === "excel" ? importXlsx(new Uint8Array(await file.arrayBuffer())) : importCsv(file.name, await file.text());
  if (target === "pdf") {
    const pdf = await sheetPdf(r.sheets, base);
    return { blob: new Blob([pdf as BlobPart], { type: "application/pdf" }), name: base + ".pdf", detail: plural(r.sheets.length, "hoja", "hojas"), warning: r.warning };
  }
  if (r.sheets.length === 1)
    return { blob: new Blob([sheetCsv(r.sheets[0])], { type: "text/csv;charset=utf-8" }), name: base + ".csv", detail: "1 hoja", warning: r.warning };
  const enc = new TextEncoder(),
    zip = zipImages(r.sheets.map((s, i) => ({ name: String(i + 1).padStart(2, "0") + "-" + safe(s.name) + ".csv", bytes: enc.encode(sheetCsv(s)) })));
  return { blob: new Blob([zip as BlobPart], { type: "application/zip" }), name: base + "-hojas.zip", detail: plural(r.sheets.length, "hoja", "hojas"), warning: r.warning };
}
