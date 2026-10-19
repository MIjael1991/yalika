// Formatos de imagen propios de cada sistema, escritos a mano (sin servidor ni librerías):
// .ico (Windows), .icns (Mac), BMP y TIFF. Los PNG de cada tamaño los crea el navegador; aquí solo se empaquetan.
import type { Pixels } from "./yalika-scan";
export type Png = { size: number; bytes: Uint8Array };
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;
export const LINUX_SIZES = [16, 22, 24, 32, 48, 64, 128, 256, 512] as const;
// Tipos de icono de macOS que guardan un PNG: tamaño en píxeles de cada uno.
export const ICNS_TYPES = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
] as const;
export const ICNS_SIZES = ICNS_TYPES.map(([, s]) => s);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (b: Uint8Array) => b.length > 8 && PNG_SIGNATURE.every((x, i) => b[i] === x);
function check(images: Png[], allowed: readonly number[], what: string) {
  if (!images.length) throw Error("No hay imágenes para crear el icono " + what + ".");
  for (const im of images) {
    if (!allowed.includes(im.size) || !isPng(im.bytes)) throw Error("Imagen no válida para el icono " + what + ".");
  }
}
// Icono de Windows: varios PNG (16 a 256 px) en un solo archivo. Lo entienden Windows Vista y posteriores.
export function icoFile(images: Png[]): Uint8Array {
  check(images, ICO_SIZES, ".ico");
  const list = images.slice().sort((a, b) => a.size - b.size),
    head = 6 + 16 * list.length,
    out = new Uint8Array(head + list.reduce((n, i) => n + i.bytes.length, 0)),
    v = new DataView(out.buffer);
  v.setUint16(2, 1, true); // tipo: icono
  v.setUint16(4, list.length, true);
  let offset = head;
  list.forEach((im, i) => {
    const e = 6 + 16 * i;
    out[e] = im.size >= 256 ? 0 : im.size; // 0 significa 256
    out[e + 1] = im.size >= 256 ? 0 : im.size;
    v.setUint16(e + 4, 1, true); // planos
    v.setUint16(e + 6, 32, true); // bits por píxel
    v.setUint32(e + 8, im.bytes.length, true);
    v.setUint32(e + 12, offset, true);
    out.set(im.bytes, offset);
    offset += im.bytes.length;
  });
  return out;
}
// Icono de Mac: bloques «tipo + largo + PNG». Todos los números van en orden de red (big-endian).
export function icnsFile(images: Png[]): Uint8Array {
  check(images, ICNS_SIZES, ".icns");
  const list = images
      .slice()
      .sort((a, b) => a.size - b.size)
      .map((im) => ({ type: ICNS_TYPES.find(([, s]) => s === im.size)![0], bytes: im.bytes })),
    total = 8 + list.reduce((n, i) => n + 8 + i.bytes.length, 0),
    out = new Uint8Array(total),
    v = new DataView(out.buffer),
    tag = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  tag(0, "icns");
  v.setUint32(4, total);
  let at = 8;
  for (const i of list) {
    tag(at, i.type);
    v.setUint32(at + 4, 8 + i.bytes.length);
    out.set(i.bytes, at + 8);
    at += 8 + i.bytes.length;
  }
  return out;
}
const MAX_FLAT = 4096;
function rgbOf(p: Pixels) {
  if (!p.width || !p.height || p.width > MAX_FLAT || p.height > MAX_FLAT || p.data.length !== p.width * p.height * 4)
    throw Error("La imagen no es válida o pasa de " + MAX_FLAT + " píxeles de lado.");
  return p.data;
}
// BMP de 24 bits (el clásico de Windows): se guarda de abajo hacia arriba, con cada fila alineada a 4 bytes.
export function bmpFile(p: Pixels): Uint8Array {
  const d = rgbOf(p),
    row = Math.ceil((p.width * 3) / 4) * 4,
    size = 54 + row * p.height,
    out = new Uint8Array(size),
    v = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, p.width, true);
  v.setInt32(22, p.height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * p.height, true);
  v.setInt32(38, 2835, true); // 72 ppp
  v.setInt32(42, 2835, true);
  for (let y = 0; y < p.height; y++) {
    let o = 54 + (p.height - 1 - y) * row;
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      out[o++] = d[i + 2];
      out[o++] = d[i + 1];
      out[o++] = d[i];
    }
  }
  return out;
}
// TIFF sin compresión, RGB de 8 bits: el que aceptan Mac, Windows y Linux sin programas extra.
export function tiffFile(p: Pixels): Uint8Array {
  const d = rgbOf(p),
    n = 9,
    ifd = 8,
    extra = ifd + 2 + n * 12 + 4, // aquí van los 3 valores de «bits por muestra»
    data = extra + 8,
    bytes = p.width * p.height * 3,
    out = new Uint8Array(data + bytes),
    v = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  v.setUint16(2, 42, true);
  v.setUint32(4, ifd, true);
  v.setUint16(ifd, n, true);
  // [etiqueta, tipo (3 = corto, 4 = largo), cantidad, valor]
  const entries: [number, number, number, number][] = [
    [256, 4, 1, p.width],
    [257, 4, 1, p.height],
    [258, 3, 3, extra],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, data],
    [277, 3, 1, 3],
    [278, 4, 1, p.height],
    [279, 4, 1, bytes],
  ];
  entries.forEach(([tag, type, count, value], i) => {
    const e = ifd + 2 + i * 12;
    v.setUint16(e, tag, true);
    v.setUint16(e + 2, type, true);
    v.setUint32(e + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(e + 8, value, true);
    else v.setUint32(e + 8, value, true);
  });
  for (let i = 0; i < 3; i++) v.setUint16(extra + i * 2, 8, true);
  for (let i = 0, o = data; i < d.length; i += 4) {
    out[o++] = d[i];
    out[o++] = d[i + 1];
    out[o++] = d[i + 2];
  }
  return out;
}
// Nombre de icono que aceptan los escritorios de Linux: minúsculas, sin espacios ni acentos.
export const linuxIconName = (base: string) =>
  base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "icono";
export const ICON_README = (name: string, linux: string) =>
  `Iconos de «${name}» listos para cada sistema.

WINDOWS  (carpeta Windows)
  ${name}.ico
  Para un acceso directo: clic derecho > Propiedades > Cambiar icono > Examinar y elige el archivo .ico.
  Para una carpeta: clic derecho > Propiedades > Personalizar > Cambiar icono.

MAC  (carpeta Mac)
  ${name}.icns
  Para una carpeta o archivo: abre el .icns con Vista previa, Comando+A y Comando+C; luego selecciona el archivo,
  Comando+I (Obtener información), clic en el icono de arriba a la izquierda y Comando+V.
  Para una app que estés creando: copia el .icns en Contents/Resources dentro de la app.

LINUX  (carpeta Linux)
  icons/hicolor/<tamaño>/apps/${linux}.png
  Copia la carpeta «icons» a ~/.local/share/ (o a /usr/share/ para todos los usuarios) y en tu archivo .desktop pon
  Icon=${linux}
  Si el icono no aparece, actualiza el caché con: gtk-update-icon-cache ~/.local/share/icons/hicolor
`;
