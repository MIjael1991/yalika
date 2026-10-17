// Reconocimiento de texto (OCR) en español, dentro del navegador.
// La imagen nunca sale del dispositivo; solo se descargan una vez el motor y el idioma.
export type OcrAssets = { workerPath?: string; corePath?: string; langPath?: string };
export type OcrEngine = {
  recognize(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }>;
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
      const { data } = await worker.recognize(canvas);
      return { text: data.text, confidence: data.confidence };
    },
    async close() {
      await worker.terminate();
    },
  };
}
