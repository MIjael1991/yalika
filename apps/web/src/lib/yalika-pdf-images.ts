// PDF a imágenes en el navegador. Cada página se dibuja y se guarda como JPG o PNG.
import type { PageImage } from "./yalika-zip";
import { loadPdfjs, pdfError } from "./yalika-pdfjs";
export type ImageFormat = "jpeg" | "png";
export const MAX_PDF_IMAGE_PAGES = 50;
const MAX_SIDE = 4000;
// Dibuja cada página del PDF en un lienzo y la entrega una por una (no guarda todas en memoria).
export async function renderPdf(
  data: Uint8Array,
  dpi: number,
  maxPages: number,
  each: (canvas: HTMLCanvasElement, n: number, total: number) => Promise<void>,
): Promise<void> {
  const pdfjs = await loadPdfjs(),
    task = pdfjs.getDocument({ data: data.slice() });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    await task.destroy();
    throw pdfError(e);
  }
  try {
    if (pdf.numPages > maxPages)
      throw Error("Este PDF tiene " + pdf.numPages + " páginas. El máximo es " + maxPages + ".");
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n),
        natural = page.getViewport({ scale: 1 }),
        scale = Math.min(dpi / 72, MAX_SIDE / Math.max(natural.width, natural.height)),
        viewport = page.getViewport({ scale }),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Tu navegador no permite dibujar la página.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      await each(canvas, n, pdf.numPages);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}
export async function pdfToImages(
  data: Uint8Array,
  dpi: 150 | 220,
  format: ImageFormat,
  base: string,
  progress: (done: number, total: number) => void,
): Promise<PageImage[]> {
  const out: PageImage[] = [];
  let total = 0;
  await renderPdf(data, dpi, MAX_PDF_IMAGE_PAGES, async (canvas, n, count) => {
    total = count;
    progress(n - 1, count);
    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, format === "png" ? "image/png" : "image/jpeg", 0.9),
    );
    if (!blob) throw Error("No se pudo crear la imagen de la página " + n + ".");
    out.push({
      name: base + "-" + String(n).padStart(String(count).length, "0") + (format === "png" ? ".png" : ".jpg"),
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
  });
  progress(total, total);
  return out;
}
