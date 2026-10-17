// Hoja de cálculo sencilla: celdas, fórmulas y plantillas. Todo en el dispositivo, sin eval ni internet.
// Una celda que empieza con «=» es fórmula: + − * / ^, paréntesis, referencias (B3), rangos (B2:B9) y las
// funciones SUMA, PROMEDIO, MIN, MAX, CONTAR, REDONDEAR, ABS y SI.ERROR (también en inglés).
export const MAX_GRID_ROWS = 200;
export const MAX_GRID_COLS = 26;
export const MAX_CELL_TEXT = 1000;
const MAX_FORMULA = 200;
export type CellValue = number | string | { error: string };
const err = (error: string): { error: string } => ({ error });
const isErr = (v: unknown): v is { error: string } => typeof v === "object" && v !== null;
export const colName = (i: number) => {
  let n = i + 1,
    s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
export function parseRef(s: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]{1,2})(\d{1,4})$/.exec(s);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  const r = Number(m[2]);
  return r >= 1 ? { r: r - 1, c: c - 1 } : null;
}
export const isFormula = (raw: string) => raw.length > 1 && raw.startsWith("=");
// Mexicanizado: el punto es decimal y la coma separa miles (1,250.50).
export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/^\$/, "");
  if (!/^-?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
export function fmtNumber(n: number) {
  const x = Number(n.toPrecision(12));
  return String(Object.is(x, -0) ? 0 : x);
}
export const showValue = (v: CellValue) => (isErr(v) ? v.error : typeof v === "number" ? fmtNumber(v) : v);
const FUNCS: Record<string, string> = {
  SUMA: "SUM", SUM: "SUM", PROMEDIO: "AVERAGE", AVERAGE: "AVERAGE", MIN: "MIN", MAX: "MAX",
  CONTAR: "COUNT", COUNT: "COUNT", REDONDEAR: "ROUND", ROUND: "ROUND", ABS: "ABS",
  "SI.ERROR": "IFERROR", IFERROR: "IFERROR",
};
type Tok = { t: "num" | "ref" | "fn" | "op"; v: string };
function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    let m: RegExpExecArray | null;
    const rest = src.slice(i);
    if ((m = /^\d+(\.\d+)?/.exec(rest))) { out.push({ t: "num", v: m[0] }); i += m[0].length; }
    else if ((m = /^[A-Za-z][A-Za-z0-9.]*(?=\()/.exec(rest))) { out.push({ t: "fn", v: m[0].toUpperCase() }); i += m[0].length; }
    else if ((m = /^[A-Za-z]+\d*/.exec(rest))) { out.push({ t: "ref", v: m[0] }); i += m[0].length; }
    else if ("+-*/^(),;:".includes(ch)) { out.push({ t: "op", v: ch === ";" ? "," : ch }); i++; }
    else return null;
  }
  return out;
}
// Fórmula en inglés para guardar en .xlsx (Excel las guarda siempre en inglés).
export function toEnglishFormula(raw: string) {
  return raw
    .slice(1)
    .replace(/;/g, ",")
    .replace(/[A-Za-z][A-Za-z0-9.]*(?=\s*\()/g, (f) => FUNCS[f.toUpperCase()] ?? f.toUpperCase())
    .replace(/\b([A-Za-z]{1,2})(\d{1,4})\b/g, (_, c: string, n: string) => c.toUpperCase() + n);
}
type Arg = number | { error: string } | Arg[];
export function calc(rows: string[][]): CellValue[][] {
  const memo = new Map<string, CellValue>(),
    busy = new Set<string>();
  const raw = (r: number, c: number) => rows[r]?.[c] ?? "";
  function cell(r: number, c: number): CellValue {
    const key = r + "," + c,
      hit = memo.get(key);
    if (hit !== undefined) return hit;
    if (busy.has(key)) return err("#CICLO");
    const text = raw(r, c);
    let v: CellValue;
    if (isFormula(text)) {
      busy.add(key);
      try {
        v = formula(text.slice(1));
      } catch {
        v = err("#ERROR"); // incluye cadenas de referencias demasiado largas (RangeError)
      }
      busy.delete(key);
    } else {
      const n = parseNumber(text);
      v = n === null ? text : n;
    }
    memo.set(key, v);
    return v;
  }
  function formula(src: string): CellValue {
    if (src.length > MAX_FORMULA) return err("#ERROR");
    const tokens = tokenize(src);
    if (!tokens || !tokens.length) return err("#ERROR");
    const toks: Tok[] = tokens;
    let p = 0;
    const peek = () => toks[p],
      eat = (v: string) => (peek()?.t === "op" && peek().v === v ? (p++, true) : false);
    const num = (v: CellValue): number | { error: string } =>
      isErr(v) ? v : typeof v === "number" ? v : v === "" ? 0 : (parseNumber(v) ?? err("#VALOR!"));
    function flat(a: Arg, out: number[]): { error: string } | null {
      if (Array.isArray(a)) {
        for (const x of a) { const e = flat(x, out); if (e) return e; }
        return null;
      }
      if (isErr(a)) return a;
      out.push(a);
      return null;
    }
    function range(a: string, b: string): Arg | null {
      const x = parseRef(a), y = parseRef(b);
      if (!x || !y) return null;
      const out: Arg[] = [];
      for (let r = Math.min(x.r, y.r); r <= Math.max(x.r, y.r); r++)
        for (let c = Math.min(x.c, y.c); c <= Math.max(x.c, y.c); c++) {
          if (r >= MAX_GRID_ROWS || c >= MAX_GRID_COLS) continue;
          const v = cell(r, c);
          if (isErr(v)) out.push(v);
          else if (typeof v === "number") out.push(v);
        }
      return out;
    }
    function call(name: string): CellValue {
      if (FUNCS[name] === "IFERROR") {
        const a = expr();
        if (!eat(",")) return err("#ERROR");
        const b = expr();
        if (!eat(")")) return err("#ERROR");
        return isErr(a) ? b : a;
      }
      const args: Arg[] = [];
      if (!eat(")")) {
        do {
          const t = peek();
          if (t?.t === "ref" && toks[p + 1]?.v === ":" && toks[p + 2]?.t === "ref") {
            const rg = range(t.v, toks[p + 2].v);
            if (!rg) return err("#REF!");
            args.push(rg);
            p += 3;
          } else {
            const v = num(expr());
            if (isErr(v)) return v;
            args.push(v);
          }
        } while (eat(","));
        if (!eat(")")) return err("#ERROR");
      }
      const f = FUNCS[name];
      if (!f) return err("#NOMBRE?");
      if (f === "ABS" || f === "ROUND") {
        const nums: number[] = [];
        for (const a of args) { const e = flat(a, nums); if (e) return e; }
        if (f === "ABS") return nums.length === 1 ? Math.abs(nums[0]) : err("#ERROR");
        if (nums.length !== 1 && nums.length !== 2) return err("#ERROR");
        const k = Math.round(nums[1] ?? 0);
        if (k < 0 || k > 10) return err("#NUM!");
        const m = 10 ** k;
        return (Math.sign(nums[0]) * Math.round(Math.abs(nums[0]) * m + 1e-9)) / m;
      }
      const nums: number[] = [];
      for (const a of args) { const e = flat(a, nums); if (e) return e; }
      if (f === "COUNT") return nums.length;
      if (f === "SUM") return nums.reduce((s, x) => s + x, 0);
      if (f === "AVERAGE") return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : err("#DIV/0!");
      if (!nums.length) return 0;
      return f === "MIN" ? Math.min(...nums) : Math.max(...nums);
    }
    function primary(): CellValue {
      const t = toks[p++];
      if (!t) return err("#ERROR");
      if (t.t === "num") return Number(t.v);
      if (t.t === "fn") return eat("(") ? call(t.v) : err("#ERROR");
      if (t.t === "ref") {
        const r = parseRef(t.v);
        if (!r) return err("#NOMBRE?");
        if (r.r >= MAX_GRID_ROWS || r.c >= MAX_GRID_COLS) return err("#REF!");
        if (toks[p]?.v === ":") return err("#VALOR!");
        return cell(r.r, r.c);
      }
      if (t.v === "(") {
        const v = expr();
        return eat(")") ? v : err("#ERROR");
      }
      return err("#ERROR");
    }
    function unary(): CellValue {
      if (eat("-")) { const v = num(unary()); return isErr(v) ? v : -v; }
      if (eat("+")) return unary();
      return primary();
    }
    function pow(): CellValue {
      const a = unary();
      if (!eat("^")) return a;
      const b = pow(), x = num(a), y = num(b);
      if (isErr(x)) return x;
      if (isErr(y)) return y;
      const r = x ** y;
      return Number.isFinite(r) ? r : err("#NUM!");
    }
    function term(): CellValue {
      let a = pow();
      for (;;) {
        const op = peek()?.t === "op" && (peek().v === "*" || peek().v === "/") ? toks[p++].v : "";
        if (!op) return a;
        const x = num(a), y = num(pow());
        if (isErr(x)) a = x;
        else if (isErr(y)) a = y;
        else if (op === "/") a = y === 0 ? err("#DIV/0!") : x / y;
        else a = x * y;
      }
    }
    function expr(): CellValue {
      let a = term();
      for (;;) {
        const op = peek()?.t === "op" && (peek().v === "+" || peek().v === "-") ? toks[p++].v : "";
        if (!op) return a;
        const x = num(a), y = num(term());
        if (isErr(x)) a = x;
        else if (isErr(y)) a = y;
        else a = op === "+" ? x + y : x - y;
      }
    }
    const v = expr();
    if (p < toks.length) return isErr(v) ? v : err("#ERROR");
    if (typeof v === "number" && !Number.isFinite(v)) return err("#NUM!");
    return v;
  }
  return rows.map((row, r) => row.map((_, c) => cell(r, c)));
}
export type SheetTemplate = { id: string; label: string; hint: string; header: boolean; rows: string[][] };
const fill = (n: number, make: (row: number) => string[]) => Array.from({ length: n }, (_, i) => make(i + 2));
export const SHEET_TEMPLATES: SheetTemplate[] = [
  { id: "blanco", label: "En blanco", hint: "Una hoja vacía.", header: false, rows: [] },
  {
    id: "asistencia",
    label: "Lista de asistencia",
    hint: "Marca 1 en cada día que asistió; calcula el total y el porcentaje.",
    header: true,
    rows: [
      ["No.", "Nombre", "Lun", "Mar", "Mié", "Jue", "Vie", "Asistencias", "Porcentaje"],
      ...fill(20, (r) => [String(r - 1), "", "", "", "", "", "", `=SUMA(C${r}:G${r})`, `=H${r}/5*100`]),
    ],
  },
  {
    id: "gastos",
    label: "Control de gastos",
    hint: "Anota cada gasto; el total se calcula solo.",
    header: true,
    rows: [["Fecha", "Concepto", "Categoría", "Monto"], ...fill(25, () => ["", "", "", ""]), ["", "", "Total", "=SUMA(D2:D26)"]],
  },
  {
    id: "inventario",
    label: "Inventario",
    hint: "Producto, cantidad y costo; calcula el valor de cada uno y el total.",
    header: true,
    rows: [
      ["Producto", "Cantidad", "Costo unitario", "Valor"],
      ...fill(25, (r) => ["", "", "", `=B${r}*C${r}`]),
      ["", "", "Total", "=SUMA(D2:D26)"],
    ],
  },
  {
    id: "presupuesto",
    label: "Presupuesto o cotización",
    hint: "Conceptos con cantidad y precio; calcula subtotal, IVA 16% y total.",
    header: true,
    rows: [
      ["Concepto", "Cantidad", "Precio", "Importe"],
      ...fill(15, (r) => ["", "", "", `=B${r}*C${r}`]),
      ["", "", "Subtotal", "=SUMA(D2:D16)"],
      ["", "", "IVA 16%", "=D17*0.16"],
      ["", "", "Total", "=D17+D18"],
    ],
  },
  {
    id: "calificaciones",
    label: "Calificaciones",
    hint: "Tres notas por alumno y su promedio.",
    header: true,
    rows: [
      ["Alumno", "Examen 1", "Examen 2", "Tarea", "Promedio"],
      ...fill(30, (r) => ["", "", "", "", `=SI.ERROR(PROMEDIO(B${r}:D${r});0)`]),
    ],
  },
];
export const templateRows = (id: string): string[][] => {
  const t = SHEET_TEMPLATES.find((x) => x.id === id) ?? SHEET_TEMPLATES[0];
  const rows = t.rows.map((r) => r.slice());
  return normalize(rows, 20, 8);
};
// Rellena la hoja hasta un tamaño mínimo y recorta lo que pase del máximo.
export function normalize(rows: string[][], minRows = 1, minCols = 1): string[][] {
  const width = Math.min(MAX_GRID_COLS, Math.max(minCols, ...rows.map((r) => r.length))),
    height = Math.min(MAX_GRID_ROWS, Math.max(minRows, rows.length));
  return Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => (rows[r]?.[c] ?? "").slice(0, MAX_CELL_TEXT)),
  );
}
