// Sugerencias al elegir una imagen: qué formato conviene según lo que se ve del archivo.
export type ImageInfo = { name: string; type: string; size: number; width?: number; height?: number };
const MB = 1024 * 1024;
const mp = (i: ImageInfo) => (i.width && i.height ? (i.width * i.height) / 1e6 : 0);
export function imageHints(i: ImageInfo): string[] {
  const out: string[] = [],
    ext = /\.([^.]+)$/.exec(i.name)?.[1]?.toLowerCase() ?? "",
    small = Math.min(i.width ?? Infinity, i.height ?? Infinity);
  if (/^(heic|heif)$/.test(ext) || /heic|heif/.test(i.type))
    out.push("Es una foto HEIC (iPhone o Mac). Solo Safari la abre; si aquí no carga, ábrela en la app Fotos y expórtala como JPG.");
  if (i.width && i.height) {
    const ratio = i.width / i.height;
    if (ratio > 0.9 && ratio < 1.1) {
      out.push(small >= 512 ? "Es casi cuadrada: sirve para hacer un icono para Windows, Mac o Linux." : "Es casi cuadrada pero chica (" + i.width + "×" + i.height + "): para un icono nítido empieza con una de 1024×1024 o más.");
    } else if (small < 256) out.push("La imagen es chica (" + i.width + "×" + i.height + "); como icono saldría borrosa.");
  }
  if (mp(i) >= 8 || i.size > 6 * MB) out.push("Es una imagen grande: para enviarla o subirla conviene JPG o WebP; pesan mucho menos que PNG, BMP o TIFF.");
  if (ext === "png" && i.size > 2 * MB) out.push("PNG pesado: si no necesitas fondo transparente, JPG o WebP la dejan mucho más ligera.");
  if (ext === "bmp" || ext === "tif" || ext === "tiff") out.push("Este formato pesa mucho; JPG o PNG se ven igual y ocupan menos.");
  return out;
}
