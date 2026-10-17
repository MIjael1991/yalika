"use client";
import { useMemo, useState } from "react";
import { documentName, exportPdf, exportWord } from "../../lib/yalika-document";
import { importDocument } from "../../lib/yalika-import";
import type { FileScope } from "../../lib/yalika-local-files";
import { MAX_NAMES, MAX_NAMES_TEXT, fullName, namesDocument, namesSheet, parseNames, sortNames, type NameRow } from "../../lib/yalika-names";
import { buildXlsx } from "../../lib/yalika-xlsx";
import { Delivery } from "./delivery";
import styles from "./studio.module.css";
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const EXAMPLE = "Pega aquí el mensaje o la lista. Por ejemplo:\n\n1. Juan Carlos Pérez López\n2. MARÍA DE LA CRUZ SOTO\n3. Ana García Ruiz 33 1234 5678";
type Out = { blob: Blob; name: string; detail: string };
export function NamesWorkspace({ scope }: { scope: FileScope }) {
  const [text, setText] = useState(""),
    [title, setTitle] = useState("Lista de nombres"),
    [sorted, setSorted] = useState(true),
    [rows, setRows] = useState<NameRow[]>([]),
    [skipped, setSkipped] = useState<string[]>([]),
    [cut, setCut] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [out, setOut] = useState<Out | null>(null);
  const phones = useMemo(() => rows.some((r) => r.telefono), [rows]);
  function read(value: string) {
    const r = parseNames(value);
    setText(value.slice(0, MAX_NAMES_TEXT));
    setRows(r.rows);
    setSkipped(r.skipped);
    setCut(r.cut);
    setOut(null);
    setNotice("");
  }
  function edit(i: number, patch: Partial<NameRow>) {
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setOut(null);
  }
  async function open(file: File) {
    const { doc } = await importDocument(file);
    read(
      doc.paragraphs
        .flatMap((p) => (p.table ? p.table.map((r) => r.join(" ")) : [p.text]))
        .join("\n"),
    );
  }
  async function make(kind: "xlsx" | "docx" | "pdf") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const list = (sorted ? sortNames(rows) : rows).filter((r) => fullName(r)),
        file = documentName(title);
      if (!list.length) throw Error("Primero pega los nombres.");
      const count = list.length === 1 ? "1 persona" : list.length + " personas";
      if (kind === "xlsx")
        setOut({
          blob: new Blob([buildXlsx([{ name: "Lista", rows: namesSheet(list) }], true, "yalika") as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          name: file + ".xlsx",
          detail: count + ": nombre completo y cada parte en su columna",
        });
      else if (kind === "docx") setOut({ blob: await exportWord(namesDocument(list, title.trim() || "Lista de nombres")), name: file + ".docx", detail: count + ": tabla numerada con apellidos y nombre" });
      else setOut({ blob: await exportPdf(namesDocument(list, title.trim() || "Lista de nombres")), name: file + ".pdf", detail: count + ": tabla numerada con apellidos y nombre" });
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const cell = (i: number, key: "nombres" | "paterno" | "materno" | "telefono", label: string) => (
    <input value={rows[i][key]} maxLength={120} aria-label={label + " de la persona " + (i + 1)} onChange={(e) => edit(i, { [key]: e.target.value })} />
  );
  return (
    <main className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h1>Lista de nombres</h1>
          <p>
            Pega un mensaje o una lista y se acomoda sola: separa nombre y apellidos (las dos últimas palabras son los apellidos) y la
            baja a Excel, Word o PDF. Todo ocurre en este dispositivo.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <label className={styles.field} style={{ flex: "1 1 100%" }}>
          Mensaje o lista de nombres
          <textarea
            value={text}
            rows={8}
            maxLength={MAX_NAMES_TEXT}
            placeholder={EXAMPLE}
            onChange={(e) => read(e.target.value)}
          />
        </label>
        <div className={styles.actions}>
          <label className={styles.import}>
            Abrir un archivo (Word, texto o PDF)
            <input
              hidden
              type="file"
              accept=".docx,.txt,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void open(f).catch((x) => setNotice(message(x)));
              }}
            />
          </label>
          {text && (
            <button type="button" onClick={() => read("")}>
              Borrar todo
            </button>
          )}
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <p role="status" className={styles.help}>
            Encontré {rows.length === 1 ? "1 persona" : rows.length + " personas"}. Revisa la tabla: si alguien tiene dos nombres y un solo apellido o un apellido compuesto, corrígelo aquí.
            {cut ? " Solo se toman las primeras " + MAX_NAMES + "." : ""}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.namesTable}>
              <thead>
                <tr>
                  <th scope="col">Nombre completo</th>
                  <th scope="col">Nombre(s)</th>
                  <th scope="col">Apellido paterno</th>
                  <th scope="col">Apellido materno</th>
                  {phones && <th scope="col">Teléfono</th>}
                  <th scope="col">
                    <span className={styles.srOnly}>Quitar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{fullName(r)}</td>
                    <td>{cell(i, "nombres", "Nombre(s)")}</td>
                    <td>{cell(i, "paterno", "Apellido paterno")}</td>
                    <td>{cell(i, "materno", "Apellido materno")}</td>
                    {phones && <td>{cell(i, "telefono", "Teléfono")}</td>}
                    <td>
                      <button
                        type="button"
                        aria-label={"Quitar a " + (fullName(r) || "la persona " + (i + 1))}
                        onClick={() => {
                          setRows((all) => all.filter((_, j) => j !== i));
                          setOut(null);
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.recordBar}>
            <label className={styles.field} style={{ flex: "1 1 240px" }}>
              Título (también es el nombre del archivo)
              <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={sorted} onChange={(e) => { setSorted(e.target.checked); setOut(null); }} />
              Ordenar de la A a la Z por apellido
            </label>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void make("xlsx")}>
              Pasar a Excel
            </button>
            <button type="button" disabled={busy} onClick={() => void make("docx")}>
              Pasar a Word
            </button>
            <button type="button" disabled={busy} onClick={() => void make("pdf")}>
              Pasar a PDF
            </button>
          </div>
          <p className={styles.help}>
            Excel: nombre completo y cada parte en su columna. Word y PDF: lista numerada con apellido paterno, materno y nombre(s).
          </p>
        </>
      )}
      {skipped.length > 0 && (
        <details className={styles.help}>
          <summary>
            Se dejaron fuera {skipped.length === 1 ? "1 línea" : skipped.length + " líneas"} que no parecen nombres
          </summary>
          <ul>
            {skipped.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      {notice && (
        <p role="status" className={styles.help}>
          {notice}
        </p>
      )}
      {out && <Delivery blob={out.blob} name={out.name} detail={out.detail} scope={scope} />}
    </main>
  );
}
