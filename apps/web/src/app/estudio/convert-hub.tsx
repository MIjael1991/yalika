"use client";
import { useState } from "react";
import type { FileScope } from "../../lib/yalika-local-files";
import {
  DEFAULT_OPTIONS,
  KIND_LABEL,
  classify,
  convert,
  targetsFor,
  type ConvertOptions,
  type Kind,
  type Output,
  type TargetId,
} from "../../lib/yalika-convert";
import type { PageSize, ScanMode } from "../../lib/yalika-scan";
import { Delivery } from "./delivery";
import { LayoutFields } from "./layout-fields";
import styles from "./studio.module.css";
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const size = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const STYLES: [ScanMode, string][] = [
  ["color", "Mejora automática (color)"],
  ["gray", "Mejora en gris"],
  ["bw", "Blanco y negro (documentos)"],
  ["original", "Sin mejora"],
];
// Un solo lugar para convertir: eliges el archivo y a qué formato; solo aparece lo que sí se puede.
export function ConvertHub({ scope }: { scope: FileScope }) {
  const [files, setFiles] = useState<File[]>([]),
    [kind, setKind] = useState<Kind | null>(null),
    [target, setTarget] = useState<TargetId>("pdf"),
    [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [out, setOut] = useState<Output | null>(null);
  function pick(list: FileList | null) {
    const arr = Array.from(list ?? []);
    if (!arr.length) return;
    const kinds = arr.map(classify),
      bad = kinds.find((k) => !k.kind);
    if (bad) return setNotice(bad.problem);
    const first = kinds[0].kind!;
    if (kinds.some((k) => k.kind !== first)) return setNotice("Elige archivos del mismo tipo.");
    if (arr.length > 1 && first !== "imagen") return setNotice("Aquí se convierte un archivo a la vez. Para juntar varios PDF usa «Unir PDF».");
    setFiles(arr);
    setKind(first);
    setTarget(targetsFor(first)[0].id);
    setOut(null);
    setNotice("");
  }
  async function run() {
    if (busy || !files.length) return;
    setBusy(true);
    setOut(null);
    try {
      setOut(await convert(files, target, options, setNotice));
      setNotice("");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const choices = kind ? targetsFor(kind) : [],
    chosen = choices.find((t) => t.id === target),
    set = (change: Partial<ConvertOptions>) => {
      setOptions({ ...options, ...change });
      setOut(null);
    },
    picker = (label: string, className: string) => (
      <label className={className} aria-disabled={busy}>
        {label}
        <input hidden type="file" multiple disabled={busy} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </label>
    );
  return (
    <main className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h1>Convertir archivos</h1>
          <p>Elige el archivo y a qué quieres pasarlo. Todo se hace en este dispositivo: nada se sube a internet.</p>
        </div>
      </div>
      {!kind ? (
        <div className={styles.drop}>
          <strong>Elige el archivo que quieres convertir</strong>
          <p>PDF, Word, Excel, PowerPoint, CSV, texto o fotos. Hasta 20 MB. Con fotos puedes elegir varias a la vez.</p>
          {picker("Elegir archivo", styles.bigButton)}
        </div>
      ) : (
        <>
          <div className={styles.fileRow}>
            <span className={styles.fileChip}>
              {files.length > 1 ? files.length + " fotos" : files[0].name} · {KIND_LABEL[kind]} · {size(files.reduce((n, f) => n + f.size, 0))}
            </span>
            {picker("Cambiar archivo", styles.import)}
          </div>
          <div className={styles.convertCard}>
            <label className={styles.bigField}>
              Convertir a
              <select
                className={styles.bigSelect}
                value={target}
                disabled={busy}
                onChange={(e) => {
                  setTarget(e.target.value as TargetId);
                  setOut(null);
                }}
              >
                {choices.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {chosen && <p className={styles.help}>{chosen.hint}</p>}
            {kind === "pdf" && (target === "jpg" || target === "png") && (
              <label className={styles.bigField}>
                Calidad
                <select value={options.dpi} disabled={busy} onChange={(e) => set({ dpi: Number(e.target.value) as 150 | 220 })}>
                  <option value={150}>Normal (150 ppp)</option>
                  <option value={220}>Alta (220 ppp, pesa más)</option>
                </select>
              </label>
            )}
            {kind === "imagen" && (target === "pdf" || target === "word" || target === "texto") && (
              <label className={styles.bigField}>
                Mejora de la imagen
                <select value={options.style} disabled={busy} onChange={(e) => set({ style: e.target.value as ScanMode })}>
                  {STYLES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "imagen" && target === "pdf" && (
              <>
                <label className={styles.bigField}>
                  Tamaño de hoja
                  <select value={options.size} disabled={busy} onChange={(e) => set({ size: e.target.value as PageSize })}>
                    <option value="a4">A4</option>
                    <option value="letter">Carta</option>
                    <option value="fit">Tamaño de la imagen</option>
                  </select>
                </label>
                <details>
                  <summary>Fondo, marco y márgenes</summary>
                  <LayoutFields layout={options.layout} onChange={(layout) => set({ layout })} />
                </details>
                <p className={styles.help}>Para enderezar, recortar o ajustar contraste a mano, usa «Escanear y mejorar».</p>
              </>
            )}
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void run()}>
              {busy ? "Convirtiendo…" : "Convertir"}
            </button>
          </div>
        </>
      )}
      {notice && (
        <p role="status" className={styles.help}>
          {notice}
        </p>
      )}
      {out && (
        <>
          {out.warning && <p className={styles.help}>{out.warning}</p>}
          <Delivery blob={out.blob} name={out.name} detail={out.detail} merge={target === "pdf"} scope={scope} />
        </>
      )}
    </main>
  );
}
