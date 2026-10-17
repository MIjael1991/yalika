// Leer una imagen del dispositivo a píxeles y dibujarla o guardarla de nuevo. Solo en el navegador.
import type { Pixels } from "./yalika-scan";
export async function decode(file: File, maxSide: number): Promise<Pixels> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error(
      "No se pudo leer «" + file.name + "». Usa JPG, PNG o WebP; las fotos HEIC de iPhone no se abren aquí, expórtalas como JPG.",
    );
  }
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)),
      w = Math.max(1, Math.round(bmp.width * k)),
      h = Math.max(1, Math.round(bmp.height * k)),
      canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw Error("Tu navegador no permite procesar imágenes.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    return { data: d.data, width: w, height: h };
  } finally {
    bmp.close();
  }
}
export function toCanvas(p: Pixels, canvas: HTMLCanvasElement) {
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Tu navegador no permite mostrar la imagen.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
}
export async function toBytes(p: Pixels, type: "image/jpeg" | "image/png", quality = 0.85): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  toCanvas(p, canvas);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
  if (!blob) throw Error("No se pudo crear la imagen.");
  return new Uint8Array(await blob.arrayBuffer());
}
