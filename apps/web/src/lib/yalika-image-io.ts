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
export async function toBytes(p: Pixels, type: "image/jpeg" | "image/png" | "image/webp", quality = 0.85): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  toCanvas(p, canvas);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
  if (!blob) throw Error("No se pudo crear la imagen.");
  // Si el navegador no sabe crear WebP, devuelve PNG sin avisar: se detecta aquí.
  if (blob.type !== type) throw Error("Este navegador no puede crear " + type.replace("image/", "").toUpperCase() + ". Prueba con Chrome, Edge o Firefox.");
  return new Uint8Array(await blob.arrayBuffer());
}
// Imagen del icono: cuadrada y con fondo transparente (a diferencia de decode, que rellena de blanco).
// «cover» recorta los bordes para llenar el cuadrado; si no, la imagen entra completa.
export async function iconPngs(file: File, sizes: readonly number[], cover: boolean): Promise<{ size: number; bytes: Uint8Array; width: number; height: number }[]> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error("No se pudo leer «" + file.name + "». Usa JPG, PNG o WebP; las fotos HEIC de iPhone no se abren aquí, expórtalas como JPG.");
  }
  try {
    const out: { size: number; bytes: Uint8Array; width: number; height: number }[] = [];
    for (const size of sizes) {
      const k = cover ? Math.max(size / bmp.width, size / bmp.height) : Math.min(size / bmp.width, size / bmp.height),
        w = Math.max(1, Math.round(bmp.width * k)),
        h = Math.max(1, Math.round(bmp.height * k));
      // Se reduce de a mitades para que los iconos chicos no queden con dientes.
      let src: CanvasImageSource = bmp,
        sw = bmp.width,
        sh = bmp.height;
      while (sw / 2 >= w && sh / 2 >= h) {
        const half = document.createElement("canvas");
        half.width = Math.max(1, Math.round(sw / 2));
        half.height = Math.max(1, Math.round(sh / 2));
        const hc = half.getContext("2d");
        if (!hc) throw Error("Tu navegador no permite procesar imágenes.");
        hc.imageSmoothingQuality = "high";
        hc.drawImage(src, 0, 0, half.width, half.height);
        src = half;
        sw = half.width;
        sh = half.height;
      }
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Tu navegador no permite procesar imágenes.");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
      if (!blob) throw Error("No se pudo crear el icono.");
      out.push({ size, bytes: new Uint8Array(await blob.arrayBuffer()), width: bmp.width, height: bmp.height });
    }
    return out;
  } finally {
    bmp.close();
  }
}
// Reduce una imagen a JPEG en base64 hasta que quepa en el límite; null si no se puede leer o sigue siendo muy pesada.
export async function fitPicture(file: File, maxBase64: number): Promise<{ data: string; w: number; h: number } | null> {
  for (const [side, quality] of [[1200, 0.8], [1000, 0.7], [800, 0.6], [640, 0.55]] as const) {
    const px = await decode(file, side),
      bytes = await toBytes(px, "image/jpeg", quality);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const data = btoa(bin);
    if (data.length <= maxBase64) return { data, w: px.width, h: px.height };
  }
  return null;
}
export const pictureFit = (maxBase64: number) => (bytes: Uint8Array, name: string) =>
  fitPicture(new File([bytes as BlobPart], name), maxBase64);
