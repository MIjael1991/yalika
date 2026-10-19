"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { documentName } from "../../lib/yalika-document";
import { importOcr, type ImportResult } from "../../lib/yalika-import";
import { MAX_OCR_PAGES, openOcr } from "../../lib/yalika-ocr";
import type { FileScope } from "../../lib/yalika-local-files";
import {
  MAX_PAGES,
  MAX_SIDE,
  NO_MARGINS,
  DEFAULT_LAYOUT,
  PREVIEW_SIDE,
  checkImageFile,
  detectDocument,
  processPixels,
  scanPdf,
  type Margins,
  type PageLayout,
  type PageSize,
  type Pixels,
  type Quad,
  type ScanMode,
} from "../../lib/yalika-scan";
import { decode, toBytes, toCanvas } from "../../lib/yalika-image-io";
import { CornerEditor, DEFAULT_QUAD } from "./corner-editor";
import { LayoutFields, frameStyle, previewStyle } from "./layout-fields";
import { Delivery } from "./delivery";
import { OcrResult } from "./ocr-result";
import { wordsToRows } from "../../lib/yalika-table";
import styles from "./studio.module.css";
type Page = {
  id: string;
  file: File;
  url: string;
  mode: ScanMode;
  turns: number;
  margins: Margins;
  quad: Quad | null;
  brightness: number;
  contrast: number;
};
const MODES: [ScanMode, string][] = [
  ["color", "Color"],
  ["gray", "Gris"],
  ["bw", "Blanco y negro"],
  ["original", "Sin filtro"],
];
const SIDES: [keyof Margins, string][] = [
  ["top", "Arriba"],
  ["bottom", "Abajo"],
  ["left", "Izquierda"],
  ["right", "Derecha"],
];
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Algo salió mal.";
export function ImageWorkspace({ scope }: { scope: FileScope }) {
  const [pages, setPages] = useState<Page[]>([]),
    [selected, setSelected] = useState(""),
    [showOriginal, setShowOriginal] = useState(false),
    [editing, setEditing] = useState(false),
    [editKey, setEditKey] = useState(0),
    [size, setSize] = useState<PageSize>("a4"),
    [layout, setLayout] = useState<PageLayout>(DEFAULT_LAYOUT),
    [name, setName] = useState("Escaneo"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ocr, setOcr] = useState<ImportResult | null>(null),
    [ocrTables, setOcrTables] = useState<string[][][]>([]),
    [result, setResult] = useState<{ blob: Blob; name: string; detail: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    cache = useRef<{ id: string; base: Pixels } | null>(null),
    urls = useRef<string[]>([]);
  const sel = useMemo(
    () => pages.find((p) => p.id === selected) ?? pages[0],
    [pages, selected],
  );
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  useEffect(() => {
    if (!sel) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        if (cache.current?.id !== sel.id)
          cache.current = {
            id: sel.id,
            base: await decode(sel.file, PREVIEW_SIDE),
          };
        if (!live || !canvas.current) return;
        toCanvas(processPixels(cache.current.base, sel), canvas.current);
      } catch (e) {
        if (live) setNotice(message(e));
      }
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [sel]);
  function add(list: FileList | null) {
    if (!list) return;
    const room = MAX_PAGES - pages.length,
      fresh: Page[] = [],
      problems: string[] = [];
    for (const file of Array.from(list)) {
      const problem = checkImageFile(file);
      if (problem) problems.push(problem);
      else if (fresh.length >= room)
        problems.push("Máximo " + MAX_PAGES + " páginas.");
      else {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        fresh.push({
          id: crypto.randomUUID(),
          file,
          url,
          mode: "color",
          turns: 0,
          margins: NO_MARGINS,
          quad: null,
          brightness: 0,
          contrast: 0,
        });
      }
    }
    setNotice(Array.from(new Set(problems)).join(" "));
    if (fresh.length) {
      setResult(null);
      setPages([...pages, ...fresh]);
      if (!pages.length) setSelected(fresh[0].id);
      void autoDetect(fresh);
    }
  }
  // Como los escáneres: al subir una foto se buscan solos los bordes de la hoja.
  async function autoDetect(list: Page[]) {
    let found = 0,
      failed = false;
    for (const p of list) {
      try {
        const quad = detectDocument(await decode(p.file, PREVIEW_SIDE));
        if (!quad) continue;
        found++;
        setPages((all) => all.map((x) => (x.id === p.id && !x.quad ? { ...x, quad } : x)));
      } catch {
        failed = true;
      }
    }
    if (found)
      setNotice(
        "Bordes detectados en " + found + " de " + list.length + ". Si alguno no quedó bien, usa «Ajustar esquinas» o «Quitar bordes».",
      );
    else if (!failed) setNotice("No encontré los bordes solos. Puedes marcarlos con «Ajustar esquinas».");
  }
  function patch(change: Partial<Page>, all = false) {
    if (!sel) return;
    setResult(null);
    setPages(
      pages.map((p) => (all || p.id === sel.id ? { ...p, ...change } : p)),
    );
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= pages.length) return;
    setResult(null);
    const next = [...pages];
    [next[i], next[j]] = [next[j], next[i]];
    setPages(next);
  }
  function remove(id: string) {
    setResult(null);
    const gone = pages.find((p) => p.id === id);
    if (gone) {
      URL.revokeObjectURL(gone.url);
      urls.current = urls.current.filter((u) => u !== gone.url);
    }
    if (cache.current?.id === id) cache.current = null;
    setPages(pages.filter((p) => p.id !== id));
  }
  async function detect() {
    if (!sel || busy) return;
    try {
      if (cache.current?.id !== sel.id)
        cache.current = {
          id: sel.id,
          base: await decode(sel.file, PREVIEW_SIDE),
        };
      const quad = detectDocument(cache.current.base);
      if (!quad) {
        setNotice(
          "No encontré los bordes de la hoja. Prueba con fondo más oscuro o recorta a mano.",
        );
        return;
      }
      patch({ quad, turns: 0, margins: NO_MARGINS });
      setEditKey((k) => k + 1);
      setNotice("Bordes detectados y hoja enderezada.");
    } catch (e) {
      setNotice(message(e));
    }
  }
  async function build() {
    const out = [];
    for (const [i, p] of pages.entries()) {
      setNotice("Procesando página " + (i + 1) + " de " + pages.length + "…");
      const px = processPixels(await decode(p.file, MAX_SIDE), p);
      out.push({ jpeg: await toBytes(px, "image/jpeg"), width: px.width, height: px.height });
    }
    const title = documentName(name);
    return { title, blob: await scanPdf(out, size, title, layout) };
  }
  async function recognize() {
    if (busy || !pages.length) return;
    if (pages.length > MAX_OCR_PAGES)
      return setNotice("Para reconocer texto usa " + MAX_OCR_PAGES + " páginas o menos.");
    setBusy(true);
    setOcr(null);
    setOcrTables([]);
    try {
      setNotice("Preparando el reconocimiento de texto…");
      const engine = await openOcr(),
        texts: string[] = [],
        tables: string[][][] = [];
      let sum = 0;
      try {
        for (const [i, p] of pages.entries()) {
          setNotice("Reconociendo texto de la página " + (i + 1) + " de " + pages.length + "…");
          const scratch = document.createElement("canvas");
          toCanvas(processPixels(await decode(p.file, MAX_SIDE), p), scratch);
          const r = await engine.recognize(scratch);
          texts.push(r.text);
          tables.push(wordsToRows(r.words));
          sum += r.confidence;
        }
      } finally {
        await engine.close();
      }
      setOcr(importOcr(documentName(name), texts, sum / pages.length));
      setOcrTables(tables);
      setNotice("Texto reconocido. Revísalo abajo.");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (busy || !pages.length) return;
    setBusy(true);
    setResult(null);
    try {
      const { title, blob } = await build();
      setResult({ blob, name: title + ".pdf", detail: pages.length + (pages.length === 1 ? " página" : " páginas") });
      setNotice("");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const index = sel ? pages.findIndex((p) => p.id === sel.id) : -1;
  const picker = (label: string, className: string, camera = false) => (
    <label className={className} aria-disabled={busy}>
      {label}
      <input
        hidden
        type="file"
        accept="image/*"
        multiple={!camera}
        {...(camera ? { capture: "environment" as const } : {})}
        disabled={busy}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
  return (
    <main className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h1>Escanear y mejorar</h1>
          <p>
            Convierte fotos de documentos en hojas limpias y en PDF. Tus originales no se modifican y todo se
            procesa en este dispositivo. Hasta {MAX_PAGES} páginas por PDF; para más, haz varios y únelos en «Unir PDF».
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className={styles.help}>
          {notice}
        </p>
      )}
      {!sel ? (
        <div className={styles.drop}>
          <strong>Elige las fotos de tu documento</strong>
          <p>
            Puedes elegir varias: cada foto será una página. Se buscan los bordes de la hoja, se quitan las sombras
            y se enderezan solas.
          </p>
          <div className={styles.actions}>
            {picker("Tomar foto", styles.bigButton, true)}
            {picker("Elegir fotos", styles.import)}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.scan}>
            <section aria-label="Vista previa">
              <div className={styles.preview}>
                {editing ? (
                  <CornerEditor
                    key={sel.id + ":" + editKey}
                    url={sel.url}
                    quad={sel.quad ?? DEFAULT_QUAD}
                    onCommit={(quad) => patch({ quad })}
                  />
                ) : (
                  <>
                    {showOriginal && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sel.url} alt="Imagen original" />
                    )}
                    <div hidden={showOriginal} style={previewStyle(layout)}>
                      <canvas
                        ref={canvas}
                        role="img"
                        aria-label="Vista previa de la página"
                        style={frameStyle(layout)}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className={styles.strip} role="group" aria-label="Páginas">
                {pages.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.thumb}
                    aria-pressed={p.id === sel.id}
                    aria-label={"Página " + (i + 1) + ": " + p.file.name}
                    onClick={() => setSelected(p.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" />
                    <span>{i + 1}</span>
                  </button>
                ))}
                {pages.length < MAX_PAGES && (
                  <>
                    {picker("Tomar foto", styles.bigButton, true)}
                    {picker("+ Agregar", styles.import)}
                  </>
                )}
              </div>
            </section>
            <aside className={styles.panel} aria-label={"Ajustes de la página " + (index + 1)}>
              <div>
                <h3>Vista</h3>
                <div className={styles.seg}>
                  <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>
                    Mejorada
                  </button>
                  <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>
                    Original
                  </button>
                </div>
              </div>
              <div>
                <h3>Estilo</h3>
                <div className={styles.seg}>
                  {MODES.map(([mode, label]) => (
                    <button key={mode} type="button" aria-pressed={sel.mode === mode} onClick={() => patch({ mode })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3>Brillo y contraste</h3>
                <div className={styles.sliders}>
                  <label>
                    Brillo {sel.brightness}
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      value={sel.brightness}
                      disabled={sel.mode === "bw"}
                      onChange={(e) => patch({ brightness: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Contraste {sel.contrast}
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      value={sel.contrast}
                      disabled={sel.mode === "bw"}
                      onChange={(e) => patch({ contrast: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
              <div>
                <h3>Girar</h3>
                <div className={styles.seg}>
                  <button type="button" onClick={() => patch({ turns: (sel.turns + 3) % 4 })}>
                    ↺ Izquierda
                  </button>
                  <button type="button" onClick={() => patch({ turns: (sel.turns + 1) % 4 })}>
                    ↻ Derecha
                  </button>
                </div>
              </div>
              <div>
                <h3>Bordes de la hoja</h3>
                <div className={styles.seg}>
                  <button type="button" onClick={() => void detect()}>
                    Detectar
                  </button>
                  <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>
                    {editing ? "Listo" : "Ajustar esquinas"}
                  </button>
                  <button
                    type="button"
                    disabled={!sel.quad}
                    onClick={() => {
                      patch({ quad: null });
                      setEditKey((k) => k + 1);
                    }}
                  >
                    Quitar bordes
                  </button>
                </div>
              </div>
              <details>
                <summary>Hoja del PDF: márgenes, fondo y marco</summary>
                <LayoutFields layout={layout} onChange={setLayout} />
              </details>
              <details>
                <summary>Recortar la foto</summary>
                <div className={styles.sliders}>
                  {SIDES.map(([side, label]) => (
                    <label key={side}>
                      {label} {Math.round(sel.margins[side] * 100)}%
                      <input
                        type="range"
                        min={0}
                        max={40}
                        value={Math.round(sel.margins[side] * 100)}
                        onChange={(e) => patch({ margins: { ...sel.margins, [side]: Number(e.target.value) / 100 } })}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <div>
                <h3>Esta página</h3>
                <div className={styles.seg}>
                  <button type="button" disabled={!index || busy} onClick={() => move(index, -1)}>
                    ← Mover
                  </button>
                  <button type="button" disabled={index === pages.length - 1 || busy} onClick={() => move(index, 1)}>
                    Mover →
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(sel.id)}>
                    Quitar
                  </button>
                </div>
              </div>
              <div className={styles.seg}>
                <button
                  type="button"
                  disabled={pages.length < 2}
                  onClick={() => patch({ mode: sel.mode, margins: sel.margins, turns: sel.turns, brightness: sel.brightness, contrast: sel.contrast }, true)}
                >
                  Usar este estilo en todas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    patch({ margins: NO_MARGINS, turns: 0, quad: null, brightness: 0, contrast: 0 });
                    setEditKey((k) => k + 1);
                  }}
                >
                  Restablecer
                </button>
              </div>
            </aside>
          </div>
          <div className={styles.actionBar}>
            <label>
              Nombre del PDF
              <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Tamaño de hoja
              <select value={size} onChange={(e) => setSize(e.target.value as PageSize)}>
                <option value="a4">A4</option>
                <option value="letter">Carta</option>
                <option value="fit">Tamaño de la imagen</option>
              </select>
            </label>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void create()}>
              {busy ? "Procesando…" : "Crear PDF"}
            </button>
            <button type="button" disabled={busy} onClick={() => void recognize()}>
              Reconocer texto
            </button>
          </div>
          {result && <Delivery blob={result.blob} name={result.name} detail={result.detail} merge scope={scope} />}
          {ocr && <OcrResult doc={ocr.doc} warning={ocr.warning} tables={ocrTables} scope={scope} />}
        </>
      )}
    </main>
  );
}
