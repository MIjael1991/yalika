// Convierte archivos externos en un documento editable. Solo texto: nunca se inserta HTML.
import { unzipSync } from "fflate";
import {
  MAX_CHARS,
  MAX_IMAGES,
  MAX_IMAGES_TOTAL,
  MAX_TABLES,
  MAX_TABLE_CELL,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  paragraph,
  parseDocument,
  type Paragraph,
  type YalikaDocument,
} from "./yalika-document";
import { wordsToRows, type OcrWord } from "./yalika-table";
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
export type ImportResult = { doc: YalikaDocument; warning: string };
export type PdfText = {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
  destroy?(): Promise<void> | void;
};
export type PdfLoader = (data: Uint8Array) => Promise<PdfText>;
const FONTS: Record<string, Paragraph["font"]> = {
  arial: "Arial",
  "times new roman": "Times New Roman",
  "courier new": "Courier New",
};
function entities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function title(name: string) {
  return (
    name.replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim().slice(0, 160) ||
    "Documento importado"
  );
}
function build(name: string, paragraphs: Paragraph[], warning = ""): ImportResult {
  if (!paragraphs.length) throw Error("El archivo no tiene texto para importar.");
  if (paragraphs.length > 1000)
    throw Error("El documento tiene más de 1,000 párrafos; divídelo en partes.");
  if (paragraphs.reduce((n, p) => n + p.text.length + (p.table?.flat().join("").length ?? 0), 0) > MAX_CHARS)
    throw Error("El documento supera " + MAX_CHARS.toLocaleString("en-US") + " caracteres; divídelo en partes.");
  return { doc: parseDocument({ version: 1, title: title(name), paragraphs }), warning };
}
export function importText(name: string, text: string): ImportResult {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return build(
    name,
    lines.map((l) => paragraph(l.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""))),
  );
}
const IMAGES_NOTE = "Las imágenes y formatos avanzados de Word no se conservan.";
const wText = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)]
    .map((m) => (m[0].startsWith("<w:t>") || m[0].startsWith("<w:t ") ? entities(m[1]) : " "))
    .join("")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
// Tipo de lista (viñeta o número) según word/numbering.xml.
function listKinds(numbering: string) {
  const levels = new Map<string, string>(),
    abstracts = new Map<string, string>();
  for (const [, id, body] of numbering.matchAll(/<w:abstractNum\s[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g))
    for (const [, lvl, lb] of body.matchAll(/<w:lvl\s[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g))
      levels.set(id + ":" + lvl, /<w:numFmt\s+w:val="(\w+)"/.exec(lb)?.[1] ?? "decimal");
  for (const [, num, abs] of numbering.matchAll(/<w:num\s[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId\s+w:val="(\d+)"/g))
    abstracts.set(num, abs);
  return (numId: string, ilvl: string): "bullet" | "number" =>
    levels.get((abstracts.get(numId) ?? "") + ":" + ilvl) === "bullet" ? "bullet" : "number";
}
function readDocx(bytes: Uint8Array, media: boolean) {
  if (bytes.length > MAX_IMPORT_BYTES) throw Error("El archivo pesa más de 20 MB.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        (f.name === "word/document.xml" ||
          f.name === "word/numbering.xml" ||
          (media && (f.name === "word/_rels/document.xml.rels" || /^word\/media\/[^/]+$/.test(f.name)))) &&
        f.originalSize <= MAX_IMPORT_BYTES,
    });
  } catch {
    throw Error("El archivo no es un documento de Word (.docx) válido.");
  }
  const raw = files["word/document.xml"];
  if (!raw) throw Error("El archivo no es un documento de Word (.docx) válido.");
  const xml = new TextDecoder("utf-8").decode(raw),
    kind = listKinds(files["word/numbering.xml"] ? new TextDecoder("utf-8").decode(files["word/numbering.xml"]) : ""),
    out: Paragraph[] = [],
    refs: { at: number; rid: string }[] = [];
  let tables = 0,
    trimmed = false;
  const paragraphOf = (body: string) => {
    const jc = /<w:jc\s+w:val="(\w+)"/.exec(body)?.[1],
      p = paragraph();
    p.align = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left";
    const num = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(body)?.[1],
      numId = num && /<w:numId\s+w:val="(\d+)"/.exec(num)?.[1],
      style = /<w:pStyle\s+w:val="([^"]+)"/.exec(body)?.[1] ?? "";
    if (numId && numId !== "0") p.list = kind(numId, /<w:ilvl\s+w:val="(\d+)"/.exec(num)?.[1] ?? "0");
    else if (/^ListBullet/i.test(style)) p.list = "bullet";
    else if (/^ListNumber/i.test(style)) p.list = "number";
    let text = "",
      runs = 0,
      bold = 0,
      italic = 0,
      underline = 0;
    for (const [, run] of body.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
      let piece = "";
      for (const m of run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g))
        piece += m[0].startsWith("<w:tab") ? "\t" : m[0].startsWith("<w:br") ? "\n" : entities(m[1]);
      if (!piece) continue;
      text += piece;
      runs++;
      const on = (tag: string) =>
        new RegExp("<w:" + tag + "(?:\\s+w:val=\"(?!0|false|none)[^\"]*\")?\\s*/>").test(run) ||
        (tag === "u" && /<w:u\s+w:val="(?!none)\w+"/.test(run));
      if (on("b")) bold++;
      if (on("i")) italic++;
      if (on("u")) underline++;
      if (runs === 1) {
        const sz = /<w:sz\s+w:val="(\d+)"/.exec(run)?.[1],
          font = /<w:rFonts[^>]*w:ascii="([^"]+)"/.exec(run)?.[1];
        if (sz && Number(sz) % 2 === 0 && Number(sz) / 2 >= 8 && Number(sz) / 2 <= 36)
          p.size = Number(sz) / 2;
        if (font && FONTS[font.toLowerCase()]) p.font = FONTS[font.toLowerCase()];
      }
    }
    p.text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    p.bold = runs > 0 && bold === runs;
    p.italic = runs > 0 && italic === runs;
    p.underline = runs > 0 && underline === runs;
    return p;
  };
  // Párrafos y tablas en el orden del documento; el texto de una tabla no se repite como párrafos.
  for (const [block] of xml.matchAll(/<w:tbl(?=[ >])[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    if (!block.startsWith("<w:tbl")) {
      out.push(paragraphOf(block.replace(/^<w:p(?:\s[^>]*)?>/, "").replace(/<\/w:p>$/, "")));
      for (const m of block.matchAll(/<a:blip\s[^>]*r:embed="([^"]+)"|<v:imagedata\s[^>]*r:id="([^"]+)"/g))
        refs.push({ at: out.length - 1, rid: m[1] ?? m[2] });
      continue;
    }
    const rows = [...block.matchAll(/<w:tr(?=[ >])[\s\S]*?<\/w:tr>/g)].map((r) =>
      [...r[0].matchAll(/<w:tc(?=[ >])[\s\S]*?<\/w:tc>/g)].map((c) =>
        [...c[0].matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((x) => wText(x[1]).trim()).filter(Boolean).join(" "),
      ),
    ).filter((r) => r.length);
    const cols = Math.min(Math.max(0, ...rows.map((r) => r.length)), MAX_TABLE_COLS);
    if (!cols) continue;
    if (tables >= MAX_TABLES) {
      trimmed = true;
      for (const r of rows) out.push(paragraph(r.join("\t")));
      continue;
    }
    if (rows.length > MAX_TABLE_ROWS || rows.some((r) => r.length > cols || r.some((c) => c.length > MAX_TABLE_CELL))) trimmed = true;
    const t = paragraph();
    t.table = rows.slice(0, MAX_TABLE_ROWS).map((r) =>
      Array.from({ length: cols }, (_, i) => (r[i] ?? "").slice(0, MAX_TABLE_CELL)),
    );
    tables++;
    out.push(t);
  }
  while (out.length && !out[out.length - 1].table && !out[out.length - 1].text.trim()) out.pop();
  return {
    out,
    refs,
    trimmed,
    shapes: /<w:drawing[ >]|<w:pict[ >]/.test(xml),
    total: [...xml.matchAll(/<a:blip\s[^>]*r:embed="|<v:imagedata\s[^>]*r:id="/g)].length,
    rels: files["word/_rels/document.xml.rels"] ? new TextDecoder("utf-8").decode(files["word/_rels/document.xml.rels"]) : "",
    files,
  };
}
const trimNote = (trimmed: boolean) => (trimmed ? "Algunas tablas eran muy grandes y se recortaron." : "");
export function importDocx(name: string, bytes: Uint8Array): ImportResult {
  const d = readDocx(bytes, false);
  return build(name, d.out, [trimNote(d.trimmed), d.total || d.shapes ? IMAGES_NOTE : ""].filter(Boolean).join(" "));
}
// Ajusta una imagen del Word al tamaño que admite el documento; devuelve null si no se puede usar.
export type PictureFit = (bytes: Uint8Array, name: string) => Promise<{ data: string; w: number; h: number } | null>;
const IMAGE_TYPE = /\.(?:png|jpe?g|gif|webp|bmp)$/i;
// Igual que importDocx, pero conserva las imágenes (hasta MAX_IMAGES) usando la función de ajuste del navegador.
export async function importDocxWithImages(name: string, bytes: Uint8Array, fit: PictureFit): Promise<ImportResult> {
  const d = readDocx(bytes, true),
    targets = new Map<string, string>();
  for (const [, tag] of d.rels.matchAll(/<Relationship\s([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(tag)?.[1],
      to = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (id && to) targets.set(id, to.replace(/^\/?(?:word\/)?/, "word/"));
  }
  const found: { at: number; image: Paragraph["image"] }[] = [];
  let total = 0;
  for (const ref of d.refs) {
    if (found.length >= MAX_IMAGES) break;
    const path = targets.get(ref.rid),
      raw = path ? d.files[path] : undefined;
    if (!path || !raw || !IMAGE_TYPE.test(path)) continue;
    const pic = await fit(raw, path.split("/").pop() ?? "imagen").catch(() => null);
    if (!pic || total + pic.data.length > MAX_IMAGES_TOTAL) continue;
    total += pic.data.length;
    found.push({ at: ref.at, image: { ...pic, size: "m" } });
  }
  for (const f of found.reverse()) d.out.splice(f.at + 1, 0, { ...paragraph(), align: "center", image: f.image });
  const skipped = d.total - found.length;
  return build(
    name,
    d.out,
    [
      trimNote(d.trimmed),
      skipped > 0
        ? "Se conservaron " + found.length + " de " + d.total + " imágenes; las demás no son compatibles, están dentro de tablas o superan el límite de " + MAX_IMAGES + "."
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}
export function importPptx(name: string, bytes: Uint8Array): ImportResult {
  if (bytes.length > MAX_IMPORT_BYTES) throw Error("El archivo pesa más de 20 MB.");
  const bad = "El archivo no es una presentación de PowerPoint (.pptx) válida.";
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) && f.originalSize <= MAX_IMPORT_BYTES,
    });
  } catch {
    throw Error(bad);
  }
  const slides = Object.keys(files).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (!slides.length) throw Error(bad);
  const out: Paragraph[] = [];
  slides.slice(0, 200).forEach((file, i) => {
    const head = paragraph("Diapositiva " + (i + 1));
    head.bold = true;
    head.size = 14;
    const lines: string[] = [];
    for (const [, body] of new TextDecoder("utf-8").decode(files[file]).matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)) {
      const text = [...body.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => entities(m[1])).join("").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
      if (text) lines.push(text);
    }
    if (!lines.length) return;
    out.push(head, ...lines.map((l) => paragraph(l)));
  });
  return build(
    name,
    out,
    "Se importó solo el texto de las diapositivas. Las imágenes, tablas, diseños y notas no se conservan." +
      (slides.length > 200 ? " Solo se tomaron las primeras 200 diapositivas." : ""),
  );
}
// Texto reconocido por OCR: une las líneas de cada bloque y separa los párrafos.
export function importOcr(name: string, pages: string[], confidence: number): ImportResult {
  const out: Paragraph[] = [];
  for (const page of pages)
    for (const block of page.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
      const text = block
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .reduce((acc, l) => (/[a-záéíóúñü]-$/i.test(acc) && /^[a-záéíóúñü]/.test(l) ? acc.slice(0, -1) + l : acc ? acc + " " + l : l), "")
        .replace(/\s+/g, " ");
      if (text) out.push(paragraph(text));
    }
  if (!out.length) throw Error("No se reconoció texto en la imagen. Prueba con una foto más nítida y derecha.");
  const pct = Math.max(0, Math.min(100, Math.round(confidence)));
  return build(
    name,
    out,
    "Reconocimiento automático (confianza aproximada " + pct + "%). Revisa el texto antes de usarlo: puede fallar en letra manuscrita, sellos o fotos borrosas.",
  );
}
// Un PDF hecho solo de imágenes no trae texto que copiar; hay que reconocerlo (OCR).
const SCANNED_PDF = "Este PDF no tiene texto seleccionable (parece un escaneo).";
export const isScannedPdf = (e: unknown) => e instanceof Error && e.message.startsWith(SCANNED_PDF);
type Line = { y: number; text: string };
export async function importPdf(
  name: string,
  bytes: Uint8Array,
  load: PdfLoader,
): Promise<ImportResult> {
  if (bytes.length > MAX_IMPORT_BYTES) throw Error("El archivo pesa más de 20 MB.");
  const pdf = await load(bytes),
    out: Paragraph[] = [];
  try {
    const last = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= last; n++) {
      const content = await (await pdf.getPage(n)).getTextContent(),
        lines: Line[] = [];
      let cur: Line | null = null;
      for (const item of content.items as {
        str?: string;
        hasEOL?: boolean;
        transform?: number[];
      }[]) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5] ?? 0;
        if (!cur) {
          cur = { y, text: "" };
          lines.push(cur);
        }
        cur.text += item.str;
        if (item.hasEOL) cur = null;
      }
      const clean = lines.map((l) => ({ y: l.y, text: l.text.replace(/\s+/g, " ").trim() }));
      const gaps = clean
        .slice(1)
        .map((l, i) => Math.abs(clean[i].y - l.y))
        .filter((g) => g > 0)
        .sort((a, b) => a - b);
      const normal = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      let para = "";
      clean.forEach((l, i) => {
        const gap = i ? Math.abs(clean[i - 1].y - l.y) : 0;
        if (!l.text || (normal && gap > normal * 1.6)) {
          if (para) out.push(paragraph(para));
          para = l.text;
        } else para = para ? para + " " + l.text : l.text;
      });
      if (para) out.push(paragraph(para));
    }
    return build(
      name,
      out,
      pdf.numPages > MAX_PDF_PAGES
        ? "Solo se importaron las primeras " + MAX_PDF_PAGES + " páginas. Los saltos de párrafo y el formato son aproximados."
        : "Los saltos de párrafo y el formato son aproximados; revisa el texto.",
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("El archivo no tiene texto"))
      throw Error(
        SCANNED_PDF + " Pásalo a Word desde «Convertir»: ahí se reconoce el texto de las imágenes.",
      );
    throw e;
  } finally {
    await pdf.destroy?.();
  }
}
// PDF con texto a filas y columnas: usa la posición de cada pedazo de texto en la página.
export async function importPdfTables(bytes: Uint8Array, load: PdfLoader = defaultLoader): Promise<{ pages: string[][][]; warning: string }> {
  if (bytes.length > MAX_IMPORT_BYTES) throw Error("El archivo pesa más de 20 MB.");
  const pdf = await load(bytes),
    pages: string[][][] = [];
  try {
    const last = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= last; n++) {
      const content = await (await pdf.getPage(n)).getTextContent(),
        words: OcrWord[] = [];
      for (const item of content.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
        const t = item.transform;
        if (typeof item.str !== "string" || !item.str.trim() || !t || t.length < 6) continue;
        const h = Math.abs(item.height || t[3] || 10),
          x0 = t[4],
          y1 = -t[5];
        words.push({ text: item.str, x0, x1: x0 + Math.max(1, item.width ?? item.str.length * h * 0.5), y0: y1 - h, y1 });
      }
      pages.push(wordsToRows(words));
    }
    if (!pages.some((p) => p.length)) throw Error(SCANNED_PDF + " Se reconocerá el texto de las imágenes.");
    return {
      pages,
      warning:
        (pdf.numPages > MAX_PDF_PAGES ? "Solo se tomaron las primeras " + MAX_PDF_PAGES + " páginas. " : "") +
        "Las columnas se deducen de la posición del texto; revisa que cada dato quedó en su celda.",
    };
  } finally {
    await pdf.destroy?.();
  }
}
async function defaultLoader(data: Uint8Array): Promise<PdfText> {
  const { loadPdfjs, pdfError } = await import("./yalika-pdfjs");
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: data.slice() });
  try {
    const pdf = await task.promise;
    return {
      numPages: pdf.numPages,
      getPage: (n) => pdf.getPage(n) as unknown as ReturnType<PdfText["getPage"]>,
      destroy: () => task.destroy(),
    };
  } catch (e) {
    await task.destroy();
    throw pdfError(e);
  }
}
export async function importDocument(
  file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> },
  load: PdfLoader = defaultLoader,
  fit?: PictureFit,
): Promise<ImportResult> {
  const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "";
  if (ext === "json") {
    if (file.size > MAX_TEXT_BYTES) throw Error("El documento editable debe pesar menos de 2 MB.");
    return { doc: parseDocument(JSON.parse(await file.text())), warning: "" };
  }
  if (ext === "txt" || ext === "md") {
    if (file.size > MAX_TEXT_BYTES) throw Error("El texto debe pesar menos de 2 MB.");
    return importText(file.name, await file.text());
  }
  if (file.size > MAX_IMPORT_BYTES) throw Error("El archivo pesa más de 20 MB.");
  if (ext === "docx") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return fit ? importDocxWithImages(file.name, bytes, fit) : importDocx(file.name, bytes);
  }
  if (ext === "pdf") return importPdf(file.name, new Uint8Array(await file.arrayBuffer()), load);
  throw Error("Formato no compatible. Usa .docx, .pdf, .txt o un editable de Yalika (.json).");
}
