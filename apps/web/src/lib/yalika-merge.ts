// Unir PDF e imágenes (JPG/PNG) en un solo PDF, en el navegador.
import { PDFDocument } from "pdf-lib";
export type MergeKind = "pdf" | "jpg" | "png";
export type MergeItem = { id: string; name: string; bytes: Uint8Array; kind: MergeKind; pages: number };
export const MAX_MERGE_FILE = 20 * 1024 * 1024;
export const MAX_MERGE_TOTAL = 100 * 1024 * 1024;
export const MAX_MERGE_PAGES = 500;
const starts = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
export function kindOf(b: Uint8Array): MergeKind | null {
  if (starts(b, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (starts(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return "png";
  return null;
}
export async function inspect(name: string, bytes: Uint8Array, id: string): Promise<MergeItem> {
  if (!bytes.length) throw Error("«" + name + "» está vacío.");
  if (bytes.length > MAX_MERGE_FILE) throw Error("«" + name + "» pesa más de 20 MB.");
  const kind = kindOf(bytes);
  if (!kind) throw Error("«" + name + "» no es un PDF, JPG ni PNG.");
  if (kind !== "pdf") return { id, name, bytes, kind, pages: 1 };
  try {
    const doc = await PDFDocument.load(bytes);
    return { id, name, bytes, kind, pages: doc.getPageCount() };
  } catch (e) {
    const locked = e instanceof Error && /encrypt/i.test(e.message);
    throw Error(locked ? "«" + name + "» tiene contraseña; quítala antes de unirlo." : "«" + name + "» no se pudo leer como PDF.");
  }
}
export const totals = (items: MergeItem[]) => ({
  pages: items.reduce((n, i) => n + i.pages, 0),
  bytes: items.reduce((n, i) => n + i.bytes.length, 0),
});
export async function mergePdf(items: MergeItem[], title: string, progress?: (done: number, total: number) => void) {
  const t = totals(items);
  if (!items.length) throw Error("Agrega al menos un archivo.");
  if (t.pages > MAX_MERGE_PAGES) throw Error("Máximo " + MAX_MERGE_PAGES + " páginas en total.");
  if (t.bytes > MAX_MERGE_TOTAL) throw Error("Los archivos suman más de 100 MB.");
  const out = await PDFDocument.create();
  out.setTitle(title);
  for (const [i, item] of items.entries()) {
    progress?.(i, items.length);
    if (item.kind === "pdf") {
      const src = await PDFDocument.load(item.bytes);
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
    } else {
      const img = item.kind === "jpg" ? await out.embedJpg(item.bytes) : await out.embedPng(item.bytes),
        landscape = img.width > img.height,
        [pw, ph] = landscape ? [841.89, 595.28] : [595.28, 841.89],
        k = Math.min(pw / img.width, ph / img.height),
        w = img.width * k,
        h = img.height * k,
        page = out.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  progress?.(items.length, items.length);
  return await out.save();
}
