"use client";
import { useMemo, useRef, useState, type CSSProperties } from "react";
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
import {
  FILLS,
  NUM_FORMATS,
  THEMES,
  emptyFmt,
  look,
  fitFmt,
  setFmt,
  shownText,
  theme as themeOf,
  type Align,
  type CellFmt,
  type FmtGrid,
  type NumFmt,
  type ThemeId,
} from "../../lib/yalika-book";
import type { FileScope } from "../../lib/yalika-local-files";
import { MAX_SHEET_BYTES, importCsv, importXlsx, sheetCsv, sheetPdf } from "../../lib/yalika-sheet";
import { buildXlsx } from "../../lib/yalika-xlsx";
import { Delivery } from "./delivery";
import styles from "./studio.module.css";
type Format = "xlsx" | "csv" | "pdf";
const FORMATS: { id: Format; label: string }[] = [
  { id: "xlsx", label: "Excel (.xlsx)" },
  { id: "csv", label: "CSV (solo la hoja abierta)" },
  { id: "pdf", label: "PDF" },
];
const message = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal.");
const baseName = (t: string) => t.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Hoja";
type Tab = { name: string; rows: string[][]; fmt: FmtGrid };
type Scope = "cell" | "row" | "col";
const MAX_TABS = 20;
const freshTab = (name: string, rows: string[][]): Tab => ({ name, rows, fmt: emptyFmt(rows) });
// Quita las filas y columnas vacías del final para que el archivo no salga con cuadros de sobra.
function trim(tab: Tab) {
  const rows = tab.rows;
  let h = rows.length;
  while (h > 1 && rows[h - 1].every((c) => c === "")) h--;
  const w = Math.max(1, ...rows.slice(0, h).map((r) => r.reduce((m, c, i) => (c !== "" ? i + 1 : m), 0)));
  return {
    name: tab.name,
    rows: rows.slice(0, h).map((r) => Array.from({ length: w }, (_, c) => r[c] ?? "")),
    fmt: tab.fmt.slice(0, h).map((r) => Array.from({ length: w }, (_, c) => r[c] ?? null)),
  };
}
export function SheetWorkspace({ scope }: { scope: FileScope }) {
  const [book, setBook] = useState<Tab[]>(() => [freshTab("Hoja 1", templateRows("blanco"))]),
    [at, setAt] = useState(0),
    [title, setTitle] = useState("Hoja de cálculo"),
    [header, setHeader] = useState(false),
    [style, setStyle] = useState<ThemeId>("yalika"),
    [apply, setApply] = useState<Scope>("cell"),
    [sel, setSel] = useState({ r: 0, c: 0 }),
    [tpl, setTpl] = useState("blanco"),
    [format, setFormat] = useState<Format>("xlsx"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [out, setOut] = useState<{ blob: Blob; name: string; detail: string } | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());
  const tab = book[at] ?? book[0],
    rows = tab.rows,
    fmt = tab.fmt;
  const values = useMemo(() => calc(rows), [rows]);
  const width = rows[0]?.length ?? 1;
  const confirmReplace = () => !dirty || window.confirm("Hay cambios sin guardar. ¿Reemplazar lo que tienes abierto?");
  const touch = () => {
    setDirty(true);
    setOut(null);
  };
  const patch = (change: Partial<Tab>) => {
    setBook((b) => b.map((t, i) => (i === at ? { ...t, ...change } : t)));
    touch();
  };
  const edit = (next: string[][], nextFmt: FmtGrid = fmt) => patch({ rows: next, fmt: nextFmt });
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
  const changeStyle = (v: ThemeId) => {
    setStyle(v);
    setOut(null);
  };
  const changeFormat = (v: Format) => {
    setFormat(v);
    setOut(null);
  };
  const focusCell = (r: number, c: number) => refs.current.get(r + "," + c)?.focus();
  function goTo(i: number) {
    setAt(i);
    setSel({ r: 0, c: 0 });
  }
  function addTab() {
    if (book.length >= MAX_TABS) return;
    setBook((b) => [...b, freshTab("Hoja " + (b.length + 1), templateRows("blanco"))]);
    goTo(book.length);
    touch();
  }
  function removeTab() {
    if (book.length <= 1 || !window.confirm("¿Quitar la hoja «" + tab.name + "»? No se puede deshacer.")) return;
    setBook((b) => b.filter((_, i) => i !== at));
    goTo(Math.max(0, at - 1));
    touch();
  }
  const cellsOf = (): [number, number][] =>
    apply === "cell"
      ? [[sel.r, sel.c]]
      : apply === "row"
        ? Array.from({ length: width }, (_, c) => [sel.r, c] as [number, number])
        : rows.map((_, r) => [r, sel.c] as [number, number]);
  const here: CellFmt | null = fmt[sel.r]?.[sel.c] ?? null;
  const formatCells = (change: Partial<CellFmt> | null) => patch({ fmt: setFmt(fmt, cellsOf(), change) });
  function applyTemplate(id: string) {
    if (!confirmReplace()) return;
    const t = SHEET_TEMPLATES.find((x) => x.id === id)!;
    setTpl(id);
    setBook([freshTab(id === "blanco" ? "Hoja 1" : t.label, templateRows(id))]);
    setAt(0);
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
        ? importXlsx(new Uint8Array(await file.arrayBuffer()), { rich: true })
        : ext === "csv"
          ? importCsv(file.name, await file.text())
          : null;
    if (!r) throw Error("Abre un archivo Excel (.xlsx) o CSV.");
    if (!r.sheets.length) throw Error("El archivo no tiene datos.");
    const used = r.sheets.slice(0, MAX_TABS),
      cut = used.some((x) => x.rows.length > MAX_GRID_ROWS || x.rows.some((y) => y.length > MAX_GRID_COLS));
    setBook(
      used.map((x, i) => {
        const rows = normalize(x.rows, 20, 8);
        return { name: x.name || "Hoja " + (i + 1), rows, fmt: fitFmt(x.fmt, rows) };
      }),
    );
    setAt(0);
    setTitle(baseName(file.name.replace(/\.[^.]+$/, "")));
    setHeader(true);
    setSel({ r: 0, c: 0 });
    setDirty(false);
    setOut(null);
    setNotice(
      [
        r.sheets.length > MAX_TABS ? "Solo se abrieron las primeras " + MAX_TABS + " hojas." : "",
        "Se abrió con negritas, alineación y formato de número; el estilo de Yalika se aplica al descargar.",
        cut ? "Se tomaron hasta " + MAX_GRID_ROWS + " filas y " + MAX_GRID_COLS + " columnas por hoja." : "",
        r.warning,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  // Resultado ya calculado (con formato de número) de cada hoja, para PDF y CSV.
  const shownOf = (t: { rows: string[][] }, withFormat: boolean, f: FmtGrid) => {
    const v = calc(t.rows);
    return t.rows.map((row, r) => row.map((cellRaw, c) => (withFormat ? shownText(v[r]?.[c], cellRaw, f[r]?.[c]?.n) : v[r]?.[c] === undefined ? "" : showValue(v[r][c]))));
  };
  async function make() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const sheets = book.map(trim),
        name = baseName(title);
      if (sheets.every((t) => t.rows.every((r) => r.every((c) => c === "")))) throw Error("La hoja está vacía.");
      const many = sheets.length > 1 ? sheets.length + " hojas · " : "";
      if (format === "xlsx")
        setOut({
          blob: new Blob([buildXlsx(sheets.map((t) => ({ name: t.name, rows: t.rows, fmt: t.fmt })), header, style) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          name: name + ".xlsx",
          detail: many + "Estilo " + themeOf(style).label + ". Las fórmulas se guardan como fórmulas de Excel.",
        });
      else if (format === "csv") {
        const t = trim(tab);
        setOut({ blob: new Blob([sheetCsv({ name, rows: shownOf(t, false, t.fmt) })], { type: "text/csv;charset=utf-8" }), name: name + ".csv", detail: "Solo la hoja «" + tab.name + "». Se guardan los resultados, no las fórmulas." });
      } else
        setOut({
          blob: new Blob([(await sheetPdf(sheets.map((t) => ({ name: t.name, rows: shownOf(t, true, t.fmt), fmt: t.fmt })), name, { theme: style, header })) as BlobPart], { type: "application/pdf" }),
          name: name + ".pdf",
          detail: many + "Estilo " + themeOf(style).label + ". Se imprimen los resultados, no las fórmulas.",
        });
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  const raw = rows[sel.r]?.[sel.c] ?? "";
  const aligns: [Align, string][] = [["l", "Izquierda"], ["c", "Centro"], ["r", "Derecha"]];
  return (
    <section className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h1>Hoja de cálculo</h1>
          <p>Tablas con fórmulas, varias hojas y formato. Al descargar, el archivo sale ordenado con el estilo de Yalika, listo para Excel o para imprimir.</p>
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
        {SHEET_TEMPLATES.find((t) => t.id === tpl)?.hint} Para una fórmula empieza con «=», por ejemplo =SUMA(B2:B9). Una fila que empiece con «Total» se resalta sola.
      </p>
      <div className={styles.recordBar}>
        <label className={styles.field} style={{ flex: "1 1 220px" }}>
          Nombre del archivo
          <input value={title} maxLength={60} onChange={(e) => changeTitle(e.target.value)} />
        </label>
        <label className={styles.field}>
          Estilo al descargar
          <select value={style} onChange={(e) => changeStyle(e.target.value as ThemeId)}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check} style={{ alignSelf: "flex-end" }}>
          <input type="checkbox" checked={header} onChange={(e) => changeHeader(e.target.checked)} />
          Primera fila como encabezado
        </label>
      </div>
      <p className={styles.help} style={{ margin: "0 0 8px" }}>
        {themeOf(style).hint}
      </p>
      <div className={styles.sheetTabs} role="tablist" aria-label="Hojas del archivo">
        {book.map((t, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === at} data-on={i === at || undefined} onClick={() => goTo(i)}>
            {t.name}
          </button>
        ))}
        <button type="button" disabled={book.length >= MAX_TABS} onClick={addTab}>
          + Hoja
        </button>
      </div>
      <div className={styles.recordBar} style={{ marginTop: 0 }}>
        <label className={styles.field} style={{ flex: "1 1 200px" }}>
          Nombre de esta hoja
          <input value={tab.name} maxLength={31} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <button type="button" disabled={book.length <= 1} onClick={removeTab} style={{ alignSelf: "flex-end" }}>
          Quitar esta hoja
        </button>
      </div>
      <div className={styles.fmtBar} role="group" aria-label="Formato de celdas">
        <button type="button" aria-pressed={!!here?.b} aria-label="Negrita" title="Negrita" onClick={() => formatCells({ b: here?.b ? undefined : true })}>
          <b>N</b>
        </button>
        {aligns.map(([a, label]) => (
          <button key={a} type="button" aria-pressed={here?.a === a} onClick={() => formatCells({ a: here?.a === a ? undefined : a })}>
            {label}
          </button>
        ))}
        <select aria-label="Formato de número" value={here?.n ?? ""} onChange={(e) => formatCells({ n: (e.target.value || undefined) as NumFmt | undefined })}>
          {NUM_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select aria-label="Color de relleno" value={here?.f ?? ""} onChange={(e) => formatCells({ f: e.target.value === "" ? undefined : Number(e.target.value) })}>
          <option value="">Sin color</option>
          {FILLS.map((f, i) => (
            <option key={f.name} value={i}>
              Relleno {f.name.toLowerCase()}
            </option>
          ))}
        </select>
        <select aria-label="Aplicar a" value={apply} onChange={(e) => setApply(e.target.value as Scope)}>
          <option value="cell">Aplicar a la celda</option>
          <option value="row">Aplicar a toda la fila</option>
          <option value="col">Aplicar a toda la columna</option>
        </select>
        <button type="button" onClick={() => formatCells(null)}>
          Quitar formato
        </button>
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
                    isNum = typeof v === "number",
                    f = fmt[r]?.[c] ?? null,
                    l = look(style, header, r, row, f),
                    look2: CSSProperties = {
                      fontWeight: l.bold ? 700 : undefined,
                      textAlign: l.align === "l" ? "left" : l.align === "c" ? "center" : l.align === "r" ? "right" : undefined,
                      background: l.fill ? "#" + l.fill : style !== "plano" ? "#FFFFFF" : undefined,
                      color: l.color ? "#" + l.color : l.fill || style !== "plano" ? "#1F2933" : undefined,
                    };
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
                        style={look2}
                        value={active || v === undefined ? cellRaw : shownText(v, cellRaw, f?.n)}
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
        <button type="button" disabled={rows.length >= MAX_GRID_ROWS} onClick={() => edit([...rows, Array(width).fill("")], [...fmt, Array(width).fill(null)])}>
          + Fila
        </button>
        <button type="button" disabled={width >= MAX_GRID_COLS} onClick={() => edit(rows.map((r) => [...r, ""]), fmt.map((r) => [...r, null]))}>
          + Columna
        </button>
        <button
          type="button"
          disabled={rows.length <= 1}
          onClick={() => {
            edit(rows.filter((_, i) => i !== sel.r), fmt.filter((_, i) => i !== sel.r));
            setSel({ r: Math.min(sel.r, rows.length - 2), c: sel.c });
          }}
        >
          Quitar fila {sel.r + 1}
        </button>
        <button
          type="button"
          disabled={width <= 1}
          onClick={() => {
            edit(rows.map((r) => r.filter((_, j) => j !== sel.c)), fmt.map((r) => r.filter((_, j) => j !== sel.c)));
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
