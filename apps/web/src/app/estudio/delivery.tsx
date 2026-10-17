"use client";
import Link from "next/link";
import { useState } from "react";
import { downloadBlob } from "../../lib/yalika-download";
import { KEEP_DAYS, saveLocalFile, type FileScope } from "../../lib/yalika-local-files";
import { canShareFile, shareFile } from "../../lib/yalika-share";
import styles from "./studio.module.css";
const MAX_SAVE = 20 * 1024 * 1024;
const size = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
// Qué hacer con el archivo ya hecho: enviarlo, descargarlo o dejarlo unos días en este dispositivo.
export function Delivery({
  blob,
  name,
  detail,
  merge = false,
  scope,
}: {
  blob: Blob;
  name: string;
  detail?: string;
  merge?: boolean;
  scope: FileScope;
}) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    canSave = blob.size <= MAX_SAVE;
  async function run(job: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    try {
      setNotice(await job());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.delivery} aria-label="Tu archivo está listo">
      <h2>Listo: {name}</h2>
      <p className={styles.help}>
        {size(blob.size)}
        {detail ? " · " + detail : ""}. ¿Qué quieres hacer con él?
      </p>
      <div className={styles.actions}>
        {canShareFile(blob, name) && (
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => void run(async () => ((await shareFile(blob, name)) ? "Enviado desde el menú de tu dispositivo." : ""))}
          >
            Compartir…
          </button>
        )}
        <button
          type="button"
          className={canShareFile(blob, name) ? undefined : styles.primary}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              downloadBlob(blob, name);
              return "Descargado: " + name;
            })
          }
        >
          Descargar
        </button>
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() =>
            void run(async () => {
              await saveLocalFile(scope, blob, name, crypto.randomUUID(), KEEP_DAYS);
              return "Guardado en Mis archivos de este dispositivo. Se borra solo en " + KEEP_DAYS + " días: descárgalo o compártelo si quieres conservarlo.";
            })
          }
        >
          Guardar {KEEP_DAYS} días
        </button>
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() =>
            void run(async () => {
              await saveLocalFile(scope, blob, name, crypto.randomUUID());
              return "Guardado en Mis archivos de este dispositivo, sin fecha de vencimiento. Si borras los datos del navegador se pierde: descárgalo si quieres una copia.";
            })
          }
        >
          Guardar sin vencimiento
        </button>
        {merge && (
          <Link className={styles.menuLink} href="/estudio?tab=unir">
            Unir con otros PDF
          </Link>
        )}
      </div>
      <p className={styles.help}>
        {canShareFile(blob, name)
          ? "«Compartir» abre el menú de tu dispositivo: WhatsApp, Drive, correo, Bluetooth y lo que tengas instalado."
          : "Este navegador no abre el menú de envío; descarga el archivo y envíalo desde tu dispositivo."}
        {!canSave && " Pesa más de 20 MB, por eso no se puede guardar aquí: descárgalo o compártelo."}
      </p>
      {notice && (
        <p role="status" className={styles.help}>
          {notice}
        </p>
      )}
    </section>
  );
}
