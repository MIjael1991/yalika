// Reconocimiento de texto (OCR) en español, dentro del navegador.
// La imagen nunca sale del dispositivo; solo se descargan una vez el motor y el idioma.
import type { OcrWord } from "./yalika-table";
export type OcrAssets = { workerPath?: string; corePath?: string; langPath?: string };
export type OcrEngine = {
  // «words» trae cada palabra con su posición en la imagen (sirve para armar tablas).
  recognize(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number; words: OcrWord[] }>;
  close(): Promise<void>;
};
export const MAX_OCR_PAGES = 20;
export async function openOcr(assets: OcrAssets = {}): Promise<OcrEngine> {
  const { createWorker } = await import("tesseract.js");
  let worker;
  try {
    worker = await createWorker("spa", 1, assets);
  } catch {
    throw Error(
      "No se pudo cargar el reconocimiento de texto. Revisa tu conexión a internet: se descarga una sola vez.",
    );
  }
  return {
    async recognize(canvas) {
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const words: OcrWord[] = [];
      for (const b of data.blocks ?? [])
        for (const p of b.paragraphs)
          for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
      return { text: data.text, confidence: data.confidence, words };
    },
    async close() {
      await worker.terminate();
    },
  };
}
