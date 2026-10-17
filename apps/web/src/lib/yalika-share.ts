// Enviar un archivo por el menú del sistema (WhatsApp, Drive, Bluetooth, correo…). Solo funciona donde el navegador lo permite.
const asFile = (blob: Blob, name: string) => new File([blob], name, { type: blob.type || "application/octet-stream" });
export function canShareFile(blob: Blob, name: string) {
  try {
    return typeof navigator !== "undefined" && typeof navigator.share === "function" && !!navigator.canShare?.({ files: [asFile(blob, name)] });
  } catch {
    return false;
  }
}
// Devuelve false si la persona cerró el menú sin enviar.
export async function shareFile(blob: Blob, name: string) {
  try {
    await navigator.share({ files: [asFile(blob, name)], title: name });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return false;
    throw Error("Tu navegador no pudo abrir el menú de envío. Descarga el archivo y envíalo desde ahí.");
  }
}
