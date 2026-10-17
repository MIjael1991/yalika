import { zipSync } from "fflate";
export type PageImage = { name: string; bytes: Uint8Array };
// ZIP sin compresión extra: las imágenes JPG y PNG ya vienen comprimidas.
export function zipImages(files: PageImage[]): Uint8Array {
  if (!files.length) throw Error("No hay archivos para comprimir.");
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) {
    if (!f.name || /[\\/:*?"<>|]/.test(f.name) || f.name.includes(".."))
      throw Error("Nombre de archivo no válido: " + f.name);
    if (entries[f.name]) throw Error("Nombre repetido: " + f.name);
    entries[f.name] = [f.bytes, { level: 0 }];
  }
  return zipSync(entries);
}
// ZIP con carpetas (ruta relativa, sin "..", sin barras invertidas ni rutas absolutas).
export function zipTree(files: PageImage[]): Uint8Array {
  if (!files.length) throw Error("No hay archivos para comprimir.");
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) {
    const parts = f.name.split("/");
    if (
      !f.name ||
      f.name.startsWith("/") ||
      f.name.includes("\\") ||
      parts.some((x) => !x || x === "." || x === ".." || /[:*?"<>|\u0000-\u001f]/.test(x))
    )
      throw Error("Ruta de archivo no válida: " + f.name);
    if (entries[f.name]) throw Error("Nombre repetido: " + f.name);
    entries[f.name] = [f.bytes, { level: 0 }];
  }
  return zipSync(entries);
}
