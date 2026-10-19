"use client";
import { useEffect, useState } from "react";
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
import { imageHints } from "../../lib/yalika-suggest";
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
const OCR_TARGETS: TargetId[] = ["pdf", "word", "texto", "xlsx", "csv"];
const IMAGE_TARGETS: TargetId[] = ["jpg", "png", "webp", "bmp", "tiff"];
const ICON_TARGETS: TargetId[] = ["ico", "icns", "iconos"];
// Atajos por sistema: el formato que cada uno usa para iconos.
const SYSTEMS: [string, TargetId, string][] = [
  ["Windows", "ico", "icono .ico"],
  ["Mac", "icns", "icono .icns"],
  ["Linux y todos", "iconos", "ZIP ordenado por sistema"],
];
// Mide la primera imagen para poder dar sugerencias (tamaño y forma); si no se puede abrir, se sugiere sin medidas.
function useDimensions(file: File | undefined) {
  const [dim, setDim] = useState<{ file: File; width: number; height: number } | null>(null);
  useEffect(() => {
    let live = true;
    if (!file) return;
    (async () => {
      try {
        const bmp = await createImageBitmap(file);
        if (live) setDim({ file, width: bmp.width, height: bmp.height });
        bmp.close();
      } catch {
        /* sin medidas */
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);
  return dim && dim.file === file ? dim : null;
}
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
  // Al pasar a una foto normal (JPG, PNG…) no se «mejora» sola: podría recortar o aclarar de más. Para documentos sí.
  function choose(next: TargetId) {
    const toImage = IMAGE_TARGETS.includes(next),
      fromImage = IMAGE_TARGETS.includes(target);
    if (toImage !== fromImage && kind === "imagen") setOptions({ ...options, style: toImage ? "original" : DEFAULT_OPTIONS.style });
    setTarget(next);
    setOut(null);
  }
  const dim = useDimensions(kind === "imagen" ? files[0] : undefined),
    hints = kind === "imagen" && files[0] ? imageHints({ name: files[0].name, type: files[0].type, size: files[0].size, width: dim?.width, height: dim?.height }) : [],
    choices = kind ? targetsFor(kind) : [],
    groups = [...new Set(choices.map((t) => t.group ?? ""))],
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
                onChange={(e) => choose(e.target.value as TargetId)}
              >
                {groups.map((g) => {
                  const list = choices.filter((t) => (t.group ?? "") === g),
                    items = list.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ));
                  return g ? (
                    <optgroup key={g} label={g}>
                      {items}
                    </optgroup>
                  ) : (
                    items
                  );
                })}
              </select>
            </label>
            {chosen && <p className={styles.help}>{chosen.hint}</p>}
            {kind === "imagen" && (
              <div className={styles.systems} role="group" aria-label="Formato según el sistema">
                <strong>¿Para qué sistema?</strong>
                <div className={styles.systemRow}>
                  {SYSTEMS.map(([name, id, what]) => (
                    <button
                      key={name}
                      type="button"
                      className={styles.import}
                      aria-pressed={target === id}
                      disabled={busy}
                      onClick={() => choose(id)}
                    >
                      {name}
                      <small> · {what}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hints.length > 0 && (
              <ul className={styles.hints} aria-label="Sugerencias">
                {hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            {kind === "pdf" && (target === "jpg" || target === "png") && (
              <label className={styles.bigField}>
                Calidad
                <select value={options.dpi} disabled={busy} onChange={(e) => set({ dpi: Number(e.target.value) as 150 | 220 })}>
                  <option value={150}>Normal (150 ppp)</option>
                  <option value={220}>Alta (220 ppp, pesa más)</option>
                </select>
              </label>
            )}
            {kind === "imagen" && (OCR_TARGETS.includes(target) || IMAGE_TARGETS.includes(target)) && (
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
            {kind === "imagen" && ICON_TARGETS.includes(target) && (
              <label className={styles.check}>
                <input type="checkbox" checked={options.cover} disabled={busy} onChange={(e) => set({ cover: e.target.checked })} />
                Llenar el cuadrado (recorta lo que sobre)
              </label>
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
