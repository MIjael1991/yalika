"use client";
import { useMemo, useRef, useState } from "react";
import {
  MAX_CELL_TEXT,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  SHEET_TEMPLATES,
  calc,
  colName,
  normalize,
  showValue,
  templateRows,
} from "../../lib/yalika-calc";
import type { FileScope } from "../../lib/yalika-local-files";
import { MAX_SHEET_BYTES, importCsv, importXlsx, sheetCsv, sheetPdf } from "../../lib/yalika-sheet";
import { buildXlsx } from "../../lib/yalika-xlsx";
import { Delivery } from "./delivery";
import styles from "./studio.module.css";
type Format = "xlsx" | "csv" | "pdf";
const FORMATS: { id: Format; label: string }[] = [
  { id: "xlsx", label: "Excel (.xlsx)" },
  { id: "csv", label: "CSV (texto separado por comas)" },
  { id: "pdf", label: "PDF" },
];
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const baseName = (t: string) => t.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Hoja";
// Quita las filas y columnas vacías del final para que el archivo no salga con cuadros de sobra.
function trim(rows: string[][]) {
  let h = rows.length;
  while (h > 1 && rows[h - 1].every((c) => c === "")) h--;
  let w = Math.max(1, ...rows.slice(0, h).map((r) => r.reduce((m, c, i) => (c !== "" ? i + 1 : m), 0)));
  w = Math.max(1, w);
  return rows.slice(0, h).map((r) => Array.from({ length: w }, (_, c) => r[c] ?? ""));
}
export function SheetWorkspace({ scope }: { scope: FileScope }) {
  const [rows, setRows] = useState(() => templateRows("blanco")),
    [title, setTitle] = useState("Hoja de cálculo"),
    [header, setHeader] = useState(false),
    [sel, setSel] = useState({ r: 0, c: 0 }),
    [tpl, setTpl] = useState("blanco"),
    [format, setFormat] = useState<Format>("xlsx"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [out, setOut] = useState<{ blob: Blob; name: string; detail: string } | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());
  const values = useMemo(() => calc(rows), [rows]);
  const width = rows[0]?.length ?? 1;
  const confirmReplace = () => !dirty || window.confirm("Hay cambios sin guardar. ¿Reemplazar la hoja abierta?");
  const edit = (next: string[][]) => {
    setRows(next);
    setDirty(true);
    setOut(null);
  };
  function setCell(r: number, c: number, v: string) {
    edit(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v.slice(0, MAX_CELL_TEXT) : x)) : row)));
  }
  const changeTitle = (v: string) => {
    setTitle(v);
    setOut(null);
  };
  const changeHeader = (v: boolean) => {
    setHeader(v);
    setOut(null);
  };
  const changeFormat = (v: Format) => {
    setFormat(v);
    setOut(null);
  };
  const focusCell = (r: number, c: number) => refs.current.get(r + "," + c)?.focus();
  function applyTemplate(id: string) {
    if (!confirmReplace()) return;
    const t = SHEET_TEMPLATES.find((x) => x.id === id)!;
    setTpl(id);
    setRows(templateRows(id));
    setHeader(t.header);
    setTitle(id === "blanco" ? "Hoja de cálculo" : t.label);
    setSel({ r: 0, c: 0 });
    setDirty(false);
    setOut(null);
    setNotice("");
  }
  async function open(file: File) {
    if (!confirmReplace()) return;
    if (file.size > MAX_SHEET_BYTES) throw Error("El archivo debe pesar menos de 20 MB.");
    const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
    const r =
      ext === "xlsx"
        ? importXlsx(new Uint8Array(await file.arrayBuffer()))
        : ext === "csv"
          ? importCsv(file.name, await file.text())
          : null;
    if (!r) throw Error("Abre un archivo Excel (.xlsx) o CSV.");
    const first = r.sheets[0];
    if (!first) throw Error("El archivo no tiene datos.");
    const cut = first.rows.length > MAX_GRID_ROWS || first.rows.some((x) => x.length > MAX_GRID_COLS);
    setRows(normalize(first.rows, 20, 8));
    setTitle(baseName(file.name.replace(/\.[^.]+$/, "")));
    setHeader(true);
    setSel({ r: 0, c: 0 });
    setDirty(false);
    setOut(null);
    setNotice(
      [
        r.sheets.length > 1 ? "El archivo tiene " + r.sheets.length + " hojas; se abrió la primera." : "",
        "Se abrieron los valores; las fórmulas del archivo no se conservan.",
        cut ? "Se tomaron hasta " + MAX_GRID_ROWS + " filas y " + MAX_GRID_COLS + " columnas." : "",
        r.warning,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  async function make() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const raw = trim(rows),
        shown = raw.map((row, r) => row.map((_, c) => (values[r]?.[c] === undefined ? "" : showValue(values[r][c])))),
        name = baseName(title);
      if (raw.every((r) => r.every((c) => c === ""))) throw Error("La hoja está vacía.");
      if (format === "xlsx")
        setOut({ blob: new Blob([buildXlsx([{ name, rows: raw }], header) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name: name + ".xlsx", detail: "Las fórmulas se guardan como fórmulas de Excel." });
      else if (format === "csv")
        setOut({ blob: new Blob([sheetCsv({ name, rows: shown })], { type: "text/csv;charset=utf-8" }), name: name + ".csv", detail: "Se guardan los resultados, no las fórmulas." });
      else
        setOut({ blob: new Blob([(await sheetPdf([{ name, rows: shown }], name)) as BlobPart], { type: "application/pdf" }), name: name + ".pdf", detail: "Se imprimen los resultados, no las fórmulas." });
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const raw = rows[sel.r]?.[sel.c] ?? "";
  return (
    <section className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h1>Hoja de cálculo</h1>
          <p>Tablas con fórmulas (suma, promedio, total…). Se descarga en Excel y todo se queda en tu dispositivo.</p>
        </div>
      </header>
      <div className={styles.recordBar}>
        <label className={styles.field} style={{ minWidth: 220 }}>
          Empezar con
          <select value={tpl} onChange={(e) => applyTemplate(e.target.value)}>
            {SHEET_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.import} style={{ alignSelf: "flex-end" }}>
          Abrir Excel o CSV
          <input
            hidden
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void open(f).catch((x) => setNotice(message(x)));
            }}
          />
        </label>
      </div>
      <p className={styles.help} style={{ margin: "0 0 8px" }}>
        {SHEET_TEMPLATES.find((t) => t.id === tpl)?.hint} Para una fórmula empieza con «=», por ejemplo =SUMA(B2:B9).
      </p>
      <div className={styles.recordBar}>
        <label className={styles.field} style={{ flex: "1 1 220px" }}>
          Nombre del archivo
          <input value={title} maxLength={60} onChange={(e) => changeTitle(e.target.value)} />
        </label>
        <label className={styles.check} style={{ alignSelf: "flex-end" }}>
          <input type="checkbox" checked={header} onChange={(e) => changeHeader(e.target.checked)} />
          Primera fila como encabezado
        </label>
      </div>
      <div className={styles.formulaBar}>
        <span className={styles.cellName}>{colName(sel.c) + (sel.r + 1)}</span>
        <input
          aria-label="Contenido de la celda"
          value={raw}
          maxLength={MAX_CELL_TEXT}
          onChange={(e) => setCell(sel.r, sel.c, e.target.value)}
        />
      </div>
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th aria-hidden="true" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} scope="col" data-active={c === sel.c}>
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <th scope="row" data-active={r === sel.r}>
                  {r + 1}
                </th>
                {row.map((cellRaw, c) => {
                  const active = r === sel.r && c === sel.c,
                    v = values[r]?.[c],
                    isNum = typeof v === "number";
                  return (
                    <td key={c}>
                      <input
                        ref={(el) => {
                          if (el) refs.current.set(r + "," + c, el);
                          else refs.current.delete(r + "," + c);
                        }}
                        aria-label={colName(c) + (r + 1)}
                        data-num={isNum || undefined}
                        data-err={(v !== undefined && typeof v === "object") || undefined}
                        data-head={(header && r === 0) || undefined}
                        value={active || v === undefined ? cellRaw : showValue(v)}
                        maxLength={MAX_CELL_TEXT}
                        onFocus={() => setSel({ r, c })}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "ArrowDown") {
                            e.preventDefault();
                            focusCell(Math.min(rows.length - 1, r + 1), c);
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            focusCell(Math.max(0, r - 1), c);
                          }
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={rows.length >= MAX_GRID_ROWS} onClick={() => edit([...rows, Array(width).fill("")])}>
          + Fila
        </button>
        <button type="button" disabled={width >= MAX_GRID_COLS} onClick={() => edit(rows.map((r) => [...r, ""]))}>
          + Columna
        </button>
        <button
          type="button"
          disabled={rows.length <= 1}
          onClick={() => {
            edit(rows.filter((_, i) => i !== sel.r));
            setSel({ r: Math.min(sel.r, rows.length - 2), c: sel.c });
          }}
        >
          Quitar fila {sel.r + 1}
        </button>
        <button
          type="button"
          disabled={width <= 1}
          onClick={() => {
            edit(rows.map((r) => r.filter((_, j) => j !== sel.c)));
            setSel({ r: sel.r, c: Math.min(sel.c, width - 2) });
          }}
        >
          Quitar columna {colName(sel.c)}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className={styles.actionBar}>
        <label>
          Descargar como
          <select value={format} onChange={(e) => changeFormat(e.target.value as Format)}>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void make()}>
          {busy ? "Creando…" : "Crear archivo"}
        </button>
      </div>
      {out && <Delivery scope={scope} blob={out.blob} name={out.name} detail={out.detail} />}
    </section>
  );
}
