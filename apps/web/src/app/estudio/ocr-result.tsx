"use client";
import { useState } from "react";
import {
  DOCUMENT_TYPE,
  documentName,
  exportWord,
  type YalikaDocument,
} from "../../lib/yalika-document";
import { downloadBlob } from "../../lib/yalika-download";
import { saveLocalFile, type FileScope } from "../../lib/yalika-local-files";
import styles from "./studio.module.css";
export function OcrResult({
  doc,
  warning,
  tables = [],
  scope,
}: {
  doc: YalikaDocument;
  warning: string;
  // Filas y columnas de cada página (de la posición del texto en la foto), para pasarlas a Excel.
  tables?: string[][][];
  scope: FileScope;
}) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    base = documentName(doc.title);
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
    <section className={styles.assistant} aria-label="Texto reconocido">
      <p>{warning}</p>
      <textarea
        readOnly
        aria-label="Texto reconocido"
        value={doc.paragraphs.map((p) => p.text).join("\n\n")}
      />
      <div className={styles.actions}>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              downloadBlob(await exportWord(doc), base + ".docx");
              return "Word descargado: " + base + ".docx";
            })
          }
        >
          Descargar Word
        </button>
        {tables.some((t) => t.length) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { sheetsOutput } = await import("../../lib/yalika-convert"),
                  out = sheetsOutput(tables.map((rows, i) => ({ name: "Página " + (i + 1), rows })), "xlsx", base);
                downloadBlob(out.blob, out.name);
                return "Excel descargado: " + out.name + ". Revisa números y columnas: el reconocimiento puede equivocarse.";
              })
            }
          >
            Descargar Excel
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await saveLocalFile(
                scope,
                new Blob([JSON.stringify(doc)], { type: DOCUMENT_TYPE }),
                base + ".yalika.json",
                crypto.randomUUID(),
              );
              return "Guardado. Para editarlo: pestaña Crear → «Abrir versiones guardadas».";
            })
          }
        >
          Guardar para editar
        </button>
      </div>
      <p role="status" className={styles.help}>
        {notice}
      </p>
    </section>
  );
}
