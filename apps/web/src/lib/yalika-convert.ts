// Convertidor único: de casi cualquier archivo a casi cualquier formato, todo en el dispositivo.
// Aquí vive el mapa «de qué a qué» y la conversión; la pantalla solo elige archivo y destino.
import { MAX_IMAGE_B64, documentName, exportPdf, exportWord, type YalikaDocument } from "./yalika-document";
import {
  MAX_IMPORT_BYTES,
  importDocument,
  importOcr,
  importPptx,
  isScannedPdf,
  type ImportResult,
} from "./yalika-import";
import { MAX_GRID_COLS, MAX_GRID_ROWS } from "./yalika-calc";
import { DEFAULT_LAYOUT, MAX_PAGES, type PageLayout, type PageSize, type ScanMode } from "./yalika-scan";
import { importCsv, importXlsx, sheetCsv, sheetPdf } from "./yalika-sheet";
import { wordsToRows, type OcrWord } from "./yalika-table";
import { buildXlsx } from "./yalika-xlsx";
import { zipImages, zipTree, type PageImage } from "./yalika-zip";
export type Kind = "pdf" | "word" | "excel" | "csv" | "powerpoint" | "imagen" | "texto";
export type TargetId = "word" | "pdf" | "texto" | "xlsx" | "jpg" | "png" | "webp" | "bmp" | "tiff" | "ico" | "icns" | "iconos" | "csv";
export type Target = { id: TargetId; label: string; hint: string; group?: string };
export type Source = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> };
export type Output = { blob: Blob; name: string; detail: string; warning: string };
export type ConvertOptions = { dpi: 150 | 220; size: PageSize; layout: PageLayout; style: ScanMode; cover: boolean };
export const DEFAULT_OPTIONS: ConvertOptions = { dpi: 150, size: "a4", layout: DEFAULT_LAYOUT, style: "color", cover: false };
export const KIND_LABEL: Record<Kind, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  csv: "CSV",
  powerpoint: "PowerPoint",
  imagen: "Imagen",
  texto: "Texto",
};
const T = (id: TargetId, label: string, hint: string, group?: string): Target => ({ id, label, hint, group });
const XLSX = T("xlsx", "Excel (.xlsx)", "Reconoce filas y columnas y las pone en celdas, con el estilo de Yalika. Revisa los números.");
const CSV_OCR = T("csv", "CSV (para cualquier programa)", "Filas y columnas separadas por comas; sirve para importar en otros programas.");
const WORD = T("word", "Word (.docx)", "Texto que puedes editar. Si el PDF es un escaneo, se reconoce el texto solo.");
const TEXT = T("texto", "Texto (.txt)", "Solo el texto, sin formato.");
const TARGETS: Record<Kind, Target[]> = {
  pdf: [
    WORD,
    TEXT,
    T("jpg", "Imágenes JPG", "Una imagen por página (ZIP si son varias). Pesan poco."),
    T("png", "Imágenes PNG", "Una imagen por página, sin pérdida de calidad."),
    XLSX,
    CSV_OCR,
  ],
  word: [
    T("pdf", "PDF", "Conserva el texto y el formato básico; no tablas ni imágenes."),
    TEXT,
    T("xlsx", "Excel (.xlsx)", "Cada tabla del documento en su hoja; si no hay tablas, cada párrafo en una fila."),
  ],
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
    T("pdf", "PDF", "Se mejoran solas: sombras, bordes y enderezado. Varias fotos = varias páginas.", "Documento y texto"),
    T("word", "Word (.docx)", "Reconoce el texto de la foto para que lo edites.", "Documento y texto"),
    { ...TEXT, group: "Documento y texto" },
    { ...XLSX, hint: "Reconoce el texto y lo acomoda en filas y columnas (tablas, listas, precios). Si es texto corrido, una línea por fila.", group: "Documento y texto" },
    { ...CSV_OCR, group: "Documento y texto" },
    T("jpg", "JPG", "La más común: pesa poco. Para fotos, en cualquier sistema.", "Imagen"),
    T("png", "PNG", "Sin pérdida de calidad y con fondo transparente. Para capturas y logos.", "Imagen"),
    T("webp", "WebP", "Pesa mucho menos que JPG o PNG. Para internet y Linux.", "Imagen"),
    T("bmp", "BMP", "El clásico de Windows. Pesa mucho; solo si un programa lo pide.", "Imagen"),
    T("tiff", "TIFF", "Para imprimir o archivar en Mac y Windows. Pesa mucho.", "Imagen"),
    T("ico", "Icono de Windows (.ico)", "Para accesos directos y carpetas. Trae de 16 a 256 píxeles en un solo archivo.", "Iconos por sistema"),
    T("icns", "Icono de Mac (.icns)", "Para apps y carpetas en Mac. Trae de 16 a 1024 píxeles.", "Iconos por sistema"),
    T("iconos", "Paquete para Windows, Mac y Linux (ZIP)", "Una carpeta por sistema: .ico, .icns y los PNG de Linux, con instrucciones.", "Iconos por sistema"),
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
const text = (doc: YalikaDocument) =>
  "﻿" + doc.paragraphs.map((p) => (p.table ? p.table.map((r) => r.join("\t")).join("\n") : p.text)).join("\n\n");
async function fromDocument(r: ImportResult, target: TargetId, base: string): Promise<Output> {
  const detail = plural(r.doc.paragraphs.length, "párrafo", "párrafos");
  if (target === "word") return { blob: await exportWord(r.doc), name: base + ".docx", detail, warning: r.warning };
  if (target === "pdf") return { blob: await exportPdf(r.doc), name: base + ".pdf", detail, warning: r.warning };
  return { blob: new Blob([text(r.doc)], { type: "text/plain;charset=utf-8" }), name: base + ".txt", detail, warning: r.warning };
}
// Reconoce el texto página por página sin guardar todas las páginas en memoria.
async function ocrPages(run: (each: (canvas: HTMLCanvasElement) => Promise<void>) => Promise<void>, say: (m: string) => void) {
  const { openOcr } = await import("./yalika-ocr");
  say("Preparando el reconocimiento de texto…");
  const engine = await openOcr(),
    texts: string[] = [],
    pages: OcrWord[][] = [];
  let sum = 0;
  try {
    await run(async (canvas) => {
      say("Reconociendo texto de la página " + (texts.length + 1) + "…");
      const r = await engine.recognize(canvas);
      texts.push(r.text);
      pages.push(r.words);
      sum += r.confidence;
    });
  } finally {
    await engine.close();
  }
  return { texts, pages, confidence: sum / Math.max(1, texts.length) };
}
async function ocr(
  run: (each: (canvas: HTMLCanvasElement) => Promise<void>) => Promise<void>,
  base: string,
  say: (m: string) => void,
): Promise<ImportResult> {
  const r = await ocrPages(run, say);
  return importOcr(base, r.texts, r.confidence);
}
// Filas y columnas listas para Excel (o CSV): una hoja por foto o página.
type Grid = { name: string; rows: string[][] };
export function sheetsOutput(grids: Grid[], target: "xlsx" | "csv", base: string, warning = ""): Output {
  if (!grids.some((g) => g.rows.some((r) => r.some(Boolean)))) throw Error("No se encontró nada que poner en la hoja.");
  let cut = grids.length > 20;
  const sheets = grids.slice(0, 20).map((g) => {
    if (g.rows.length > MAX_GRID_ROWS || g.rows.some((r) => r.length > MAX_GRID_COLS)) cut = true;
    return { name: g.name, rows: g.rows.slice(0, MAX_GRID_ROWS).map((r) => r.slice(0, MAX_GRID_COLS)) };
  });
  const note = [warning, cut ? "Se tomaron hasta 20 hojas, " + MAX_GRID_ROWS + " filas y " + MAX_GRID_COLS + " columnas." : ""].filter(Boolean).join(" "),
    detail = plural(sheets.length, "hoja", "hojas");
  if (target === "xlsx") {
    const header = sheets.some((s) => (s.rows[0]?.length ?? 0) > 1);
    return { blob: new Blob([buildXlsx(sheets, header, "yalika") as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name: base + ".xlsx", detail, warning: note };
  }
  const enc = new TextEncoder();
  if (sheets.length === 1) return { blob: new Blob([csvOf(sheets[0].rows)], { type: "text/csv;charset=utf-8" }), name: base + ".csv", detail, warning: note };
  const zip = zipImages(sheets.map((s, i) => ({ name: String(i + 1).padStart(2, "0") + "-" + safe(s.name) + ".csv", bytes: enc.encode(csvOf(s.rows)) })));
  return { blob: new Blob([zip as BlobPart], { type: "application/zip" }), name: base + "-hojas.zip", detail, warning: note };
}
// Cada tabla de Word es una hoja; sin tablas, cada párrafo es una fila.
function docSheets(doc: YalikaDocument): Grid[] {
  const tables = doc.paragraphs.filter((p) => p.table);
  if (tables.length) return tables.map((p, i) => ({ name: "Tabla " + (i + 1), rows: p.table! }));
  return [{ name: "Texto", rows: doc.paragraphs.filter((p) => p.text.trim()).map((p) => [p.text]) }];
}
const csvOf = (rows: string[][]) => sheetCsv({ name: "hoja", rows });
const OCR_NOTE = (pct: number) =>
  "Reconocimiento automático (confianza aproximada " + Math.max(0, Math.min(100, Math.round(pct))) + "%). Revisa los números y las columnas: puede confundir 0 con O o unir columnas muy juntas.";
async function ocrSheets(
  run: (each: (canvas: HTMLCanvasElement) => Promise<void>) => Promise<void>,
  label: string,
  target: "xlsx" | "csv",
  base: string,
  say: (m: string) => void,
): Promise<Output> {
  const r = await ocrPages(run, say),
    grids = r.pages.map((w, i) => ({ name: label + " " + (i + 1), rows: wordsToRows(w) }));
  if (!grids.some((g) => g.rows.length)) throw Error("No se reconoció texto en la imagen. Prueba con una foto más nítida y derecha.");
  return sheetsOutput(grids, target, base, OCR_NOTE(r.confidence));
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
  if (target === "ico" || target === "icns" || target === "iconos") {
    if (files.length > 1) throw Error("Para crear iconos elige una sola imagen.");
    return fromIcons(files[0], target, o, base, say);
  }
  if (target === "jpg" || target === "png" || target === "webp" || target === "bmp" || target === "tiff") {
    const type = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff" }[target],
      ext = target === "tiff" ? "tif" : target,
      out: PageImage[] = [];
    for (const [i, f] of files.entries()) {
      say("Convirtiendo imagen " + (i + 1) + " de " + files.length + "…");
      let bytes: Uint8Array;
      if (target === "bmp" || target === "tiff") {
        // Estos dos no se comprimen: se limitan a 4096 píxeles de lado para que no ocupen cientos de MB.
        const { bmpFile, tiffFile } = await import("./yalika-imgfmt");
        bytes = (target === "bmp" ? bmpFile : tiffFile)(await io.decode(f, 4096));
      } else bytes = await io.toBytes(await io.decode(f, 6000), type as "image/jpeg" | "image/png" | "image/webp", 0.92);
      out.push({ name: baseName(f.name) + "." + ext, bytes });
    }
    if (out.length === 1) return { blob: new Blob([out[0].bytes as BlobPart], { type }), name: out[0].name, detail: "1 imagen", warning: target === "bmp" || target === "tiff" ? "Este formato no se comprime: el archivo pesa mucho más que un JPG." : "" };
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
  if (target === "xlsx" || target === "csv") return ocrSheets(run, "Foto", target, base, say);
  return fromDocument(await ocr(run, base, say), target, base);
}
// Iconos de Windows, Mac y Linux a partir de una imagen (transparencia incluida).
async function fromIcons(file: File, target: "ico" | "icns" | "iconos", o: ConvertOptions, base: string, say: (m: string) => void): Promise<Output> {
  const io = await import("./yalika-image-io"),
    fm = await import("./yalika-imgfmt");
  say("Creando iconos…");
  const sizes = target === "ico" ? fm.ICO_SIZES : target === "icns" ? fm.ICNS_SIZES : [...new Set([...fm.ICO_SIZES, ...fm.ICNS_SIZES, ...fm.LINUX_SIZES])].sort((a, b) => a - b),
    made = await io.iconPngs(file, sizes, o.cover),
    pick = (list: readonly number[]) => made.filter((m) => list.includes(m.size)),
    side = Math.max(made[0].width, made[0].height),
    need = target === "ico" ? 256 : 512,
    warning =
      side < need
        ? "La imagen mide " + made[0].width + "×" + made[0].height + " píxeles; los iconos más grandes saldrán suavizados. Con una de 1024×1024 o más quedan nítidos."
        : o.cover
          ? ""
          : made[0].width === made[0].height
            ? ""
            : "La imagen no es cuadrada: el icono la muestra completa con espacio transparente a los lados. Activa «Llenar el cuadrado» para recortarla.";
  if (target === "ico") return { blob: new Blob([fm.icoFile(pick(fm.ICO_SIZES)) as BlobPart], { type: "image/vnd.microsoft.icon" }), name: base + ".ico", detail: "Tamaños " + fm.ICO_SIZES.join(", ") + " px", warning };
  if (target === "icns") return { blob: new Blob([fm.icnsFile(pick(fm.ICNS_SIZES)) as BlobPart], { type: "image/icns" }), name: base + ".icns", detail: "Tamaños " + fm.ICNS_SIZES.join(", ") + " px", warning };
  const linux = fm.linuxIconName(base),
    root = base + "-iconos/",
    files: PageImage[] = [
      { name: root + "Windows/" + base + ".ico", bytes: fm.icoFile(pick(fm.ICO_SIZES)) },
      { name: root + "Mac/" + base + ".icns", bytes: fm.icnsFile(pick(fm.ICNS_SIZES)) },
      ...pick(fm.LINUX_SIZES).map((m) => ({ name: root + "Linux/icons/hicolor/" + m.size + "x" + m.size + "/apps/" + linux + ".png", bytes: m.bytes })),
      { name: root + "LEEME.txt", bytes: new TextEncoder().encode("﻿" + fm.ICON_README(base, linux)) },
    ];
  return { blob: new Blob([zipTree(files) as BlobPart], { type: "application/zip" }), name: base + "-iconos.zip", detail: "Windows, Mac y Linux", warning };
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
  const sheets = target === "xlsx" || target === "csv";
  try {
    if (sheets) {
      const { importPdfTables } = await import("./yalika-import");
      const r = await importPdfTables(bytes);
      return sheetsOutput(r.pages.map((rows, i) => ({ name: "Página " + (i + 1), rows })), target, base, r.warning);
    }
    return await fromDocument(await importDocument(file), target, base);
  } catch (e) {
    if (!isScannedPdf(e)) throw e;
    const { MAX_OCR_PAGES } = await import("./yalika-ocr");
    const { renderPdf } = await import("./yalika-pdf-images");
    const run = (each: (c: HTMLCanvasElement) => Promise<void>) => renderPdf(bytes, 200, MAX_OCR_PAGES, (canvas) => each(canvas));
    if (sheets) return ocrSheets(run, "Página", target, base, say);
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
  if (kind === "word" && target === "xlsx") {
    const r = await importDocument(file);
    return sheetsOutput(docSheets(r.doc), "xlsx", base, r.warning);
  }
  if (kind === "word" || kind === "texto") {
    const { pictureFit } = await import("./yalika-image-io");
    return fromDocument(await importDocument(file, undefined, pictureFit(MAX_IMAGE_B64)), target, base);
  }
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
