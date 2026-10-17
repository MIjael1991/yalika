// Carga única de pdf.js (versión "legacy": funciona en navegadores más antiguos, Safari incluido). Solo se descarga al usarse.
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}
export function pdfError(e: unknown) {
  const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
  if (name === "PasswordException")
    return Error("Este PDF tiene contraseña. Quítala y vuelve a intentar.");
  const text = e instanceof Error ? e.message : "";
  if (name === "InvalidPDFException" || name === "FormatError" || /invalid pdf|missing pdf|pdf header|xref/i.test(text))
    return Error("El archivo no es un PDF válido.");
  return e instanceof Error ? e : Error("No se pudo leer el PDF.");
}
