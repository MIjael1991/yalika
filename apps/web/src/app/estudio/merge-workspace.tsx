"use client";
import { useState } from "react";
import { documentName } from "../../lib/yalika-document";
import { listLocalFiles, type FileScope, type LocalFile } from "../../lib/yalika-local-files";
import type { MergeItem } from "../../lib/yalika-merge";
import { Delivery } from "./delivery";
import styles from "./studio.module.css";
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";
export function MergeWorkspace({ scope }: { scope: FileScope }) {
  const [items, setItems] = useState<MergeItem[]>([]),
    [name, setName] = useState("PDF unido"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<LocalFile[] | null>(null),
    [result, setResult] = useState<{ blob: Blob; name: string; detail: string } | null>(null);
  async function add(entries: { name: string; read: () => Promise<ArrayBuffer> }[]) {
    if (busy || !entries.length) return;
    setBusy(true);
    setResult(null);
    try {
      const { inspect, totals, MAX_MERGE_PAGES } = await import("../../lib/yalika-merge");
      const fresh: MergeItem[] = [],
        problems: string[] = [];
      for (const e of entries) {
        try {
          fresh.push(await inspect(e.name, new Uint8Array(await e.read()), crypto.randomUUID()));
        } catch (err) {
          problems.push(message(err));
        }
      }
      const next = [...items, ...fresh];
      if (totals(next).pages > MAX_MERGE_PAGES) problems.push("Máximo " + MAX_MERGE_PAGES + " páginas en total.");
      else setItems(next);
      setNotice(problems.join(" "));
    } finally {
      setBusy(false);
    }
  }
  async function openSaved() {
    try {
      const all = await listLocalFiles(scope);
      setSaved(all.filter((f) => /^(application\/pdf|image\/(jpeg|png))$/.test(f.type)));
    } catch (e) {
      setNotice(message(e));
    }
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    setResult(null);
  }
  async function merge() {
    if (busy || !items.length) return;
    setBusy(true);
    setResult(null);
    try {
      const { mergePdf, totals } = await import("../../lib/yalika-merge"),
        title = documentName(name),
        bytes = await mergePdf(items, title, (done, total) =>
          setNotice("Uniendo archivo " + Math.min(done + 1, total) + " de " + total + "…"),
        );
      setResult({
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        name: title + ".pdf",
        detail: totals(items).pages + " páginas",
      });
      setNotice("");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const total = items.reduce((n, i) => ({ pages: n.pages + i.pages, bytes: n.bytes + i.bytes.length }), { pages: 0, bytes: 0 });
  const picker = (label: string) => (
    <label className={styles.bigButton} aria-disabled={busy}>
      {label}
      <input
        hidden
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void add(files.map((f) => ({ name: f.name, read: () => f.arrayBuffer() })));
        }}
      />
    </label>
  );
  return (
    <main className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h1>Unir PDF</h1>
          <p>
            Junta varios PDF y fotos (JPG o PNG) en un solo PDF. Sirve para armar uno de más de 30 páginas: escanea por
            partes y únelas aquí. Se procesa en este dispositivo.
          </p>
        </div>
      </div>
      {!items.length ? (
        <div className={styles.drop}>
          <strong>Elige los archivos que quieres juntar</strong>
          <p>El orden de la lista será el orden del PDF final. Hasta 20 MB cada uno, 100 MB y 500 páginas en total.</p>
          <div className={styles.actions}>
            {picker("Elegir archivos")}
            <button type="button" onClick={() => void openSaved()}>
              Desde Mis archivos
            </button>
          </div>
        </div>
      ) : (
        <>
          <ol className={styles.mergeList} aria-label="Archivos a unir">
            {items.map((it, i) => (
              <li key={it.id}>
                <span className={styles.mergeName}>
                  {i + 1}. {it.name}
                </span>
                <small>{it.kind === "pdf" ? it.pages + (it.pages === 1 ? " página" : " páginas") : "Foto"}</small>
                <span className={styles.seg}>
                  <button type="button" disabled={!i || busy} aria-label={"Subir " + it.name} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" disabled={i === items.length - 1 || busy} aria-label={"Bajar " + it.name} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={"Quitar " + it.name}
                    onClick={() => {
                      setItems(items.filter((x) => x.id !== it.id));
                      setResult(null);
                    }}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.fileRow}>
            {picker("+ Agregar archivos")}
            <button type="button" onClick={() => void openSaved()}>
              + Desde Mis archivos
            </button>
            <span className={styles.fileChip}>
              {items.length} archivos · {total.pages} páginas · {mb(total.bytes)}
            </span>
          </div>
          <div className={styles.card}>
            <label>
              Nombre del PDF
              <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void merge()}>
              {busy ? "Uniendo…" : "Unir en un PDF"}
            </button>
          </div>
        </>
      )}
      {saved && (
        <section className={styles.card} aria-label="Mis archivos">
          {!saved.length ? (
            <p className={styles.help}>No hay PDF ni fotos guardados en Mis archivos.</p>
          ) : (
            <ul className={styles.mergeList}>
              {saved.map((f) => (
                <li key={f.id}>
                  <span className={styles.mergeName}>{f.name}</span>
                  <small>{mb(f.size)}</small>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void add([{ name: f.name, read: () => f.blob.arrayBuffer() }])}
                  >
                    Agregar
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setSaved(null)}>
            Cerrar lista
          </button>
        </section>
      )}
      {notice && (
        <p role="status" className={styles.help}>
          {notice}
        </p>
      )}
      {result && <Delivery blob={result.blob} name={result.name} detail={result.detail} scope={scope} />}
    </main>
  );
}
