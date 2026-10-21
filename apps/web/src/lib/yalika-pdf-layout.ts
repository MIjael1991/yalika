// Reconstruye un documento de Word a partir de la POSICIÓN del texto en cada hoja del PDF.
// El PDF no guarda párrafos: solo pedazos de texto con coordenadas, y a veces fuera de orden.
// Aquí se ordenan por posición y se detectan renglones, alineación, sangrías, tablas, listas y saltos de página.
import { INDENT_CM, MAX_INDENT, MAX_TABLE_CELL, MAX_TABLE_COLS, MAX_TABLES, paragraph, type Paragraph } from "./yalika-document";
export type RawItem = { str: string; x: number; y: number; w: number; size: number; font: string; angle: number };
export type FontInfo = { bold: boolean; italic: boolean; family: Paragraph["font"] };
export type LayoutPage = { width: number; height: number; items: RawItem[]; fonts: Record<string, FontInfo> };
export type LayoutResult = { paragraphs: Paragraph[]; pageNumbers: boolean; tables: number; skipped: number; headers: number };
type Cell = { text: string; x0: number; x1: number; gap: number };
type Line = {
  page: number;
  y: number;
  size: number;
  x0: number;
  x1: number;
  cells: Cell[];
  text: string;
  bold: boolean;
  italic: boolean;
  family: Paragraph["font"];
  cls: "left" | "center" | "right";
  centered: boolean; // su centro cae en el centro del texto, aunque ocupe todo el ancho
  full: boolean; // llega al borde derecho
  edge: "" | "top" | "bottom"; // dentro del margen de arriba o de abajo de la hoja
  bullet: boolean;
  marker: boolean;
};
type Frame = { left: number; right: number; mid: number };
type Block = { kind: "line"; line: Line } | { kind: "table"; rows: string[][]; size: number; page: number; y: number; first: number };
// Marcas de lista con símbolo (las numeradas se dejan como texto: ya traen su número).
const BULLET = /^[\uf000-\uf8ff•●▪◦·‣■▸►–—-]\s*(?:\s|(?=[A-ZÁÉÍÓÚÑa-záéíóúñ0-9]))(?=\S)/;
const MARKER = /^(?:[\uf000-\uf8ff•●▪◦·‣■▸►–—-]|\d{1,2}[.)]|[a-zA-Z][.)])\s+(?=\S)/;
const PAGE_NUMBER = /^\s*(?:(?:p[aá]g(?:ina|\.)?|page)\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?\s*(?:(?:de|of|\/)\s*\d{1,4})?\s*$/i;
const END_SENTENCE = /[.!?:;]$/;
const WIDE = "";
const UNIT = INDENT_CM * 28.35; // un paso de sangría en puntos
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const clampSize = (n: number) => Math.round(Math.min(36, Math.max(8, n)));
const FALLBACK: FontInfo = { bold: false, italic: false, family: "Arial" };
// Nombre real de la letra → negrita, cursiva y familia. Sirve para PDF de Word, Google Docs, LibreOffice, Chrome…
export function fontInfo(name: string, fallbackFamily = ""): FontInfo {
  const n = name.replace(/^[A-Z]{6}\+/, "");
  return {
    bold: /bold|black|heavy|semibold|demi/i.test(n),
    italic: /italic|oblique|-it\b|slanted/i.test(n),
    family:
      /courier|mono|consolas|typewriter|lucida console/i.test(n) || fallbackFamily === "monospace"
        ? "Courier New"
        : /times|georgia|garamond|cambria|palatino|minion|bookman|century|baskerville|didot|bodoni|liberation ?serif|dejavu ?serif|nimbus ?rom|(^|[^a-z])serif/i.test(n) ||
            (fallbackFamily === "serif" && !/sans|arial|helvet|calibri|verdana|tahoma|inter|roboto|liberation ?sans/i.test(n))
          ? "Times New Roman"
          : "Arial",
  };
}
// Letras separadas por espacios («A T E N T A M E N T E») → palabra normal. Una separación ancha es el espacio entre palabras.
function despace(text: string) {
  return text
    .split(new RegExp("\\s{2,}|" + WIDE))
    .map((w) => (/^(?:\S ){2,}\S$/.test(w.trim()) ? w.trim().replace(/ /g, "") : w))
    .join(" ");
}
function buildLines(page: LayoutPage, index: number): { lines: Line[]; skipped: number } {
  let skipped = 0;
  const atoms = page.items.filter((i) => {
    if (!i.str || !i.str.trim()) return false;
    if (Math.abs(i.angle) > 0.12) {
      skipped++;
      return false;
    }
    return i.size > 1;
  });
  atoms.sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: RawItem[][] = [];
  for (const a of atoms) {
    const g = groups[groups.length - 1];
    if (g && g[0].y - a.y <= Math.max(1.2, 0.42 * Math.min(g[0].size, a.size))) g.push(a);
    else groups.push([a]);
  }
  const lines: Line[] = [];
  const chars = (a: RawItem) => a.str.trim().length;
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x);
    const size = g.reduce((best, a) => (chars(a) > chars(best) ? a : best), g[0]).size,
      cells: Cell[] = [];
    let cur: Cell | null = null,
      end = -Infinity,
      lastStr = "";
    for (const a of g) {
      const gap = a.x - end;
      if (!cur || gap > 1.5 * size) {
        cur = { text: a.str, x0: a.x, x1: a.x + a.w, gap: cur ? gap : 0 };
        cells.push(cur);
      } else {
        const spaced = lastStr.endsWith(" ") || a.str.startsWith(" ");
        cur.text += (gap > 0.95 * size ? WIDE : gap > 0.12 * size || spaced ? " " : "") + a.str;
        cur.x1 = a.x + a.w;
      }
      end = a.x + a.w;
      lastStr = a.str;
    }
    for (const c of cells) c.text = despace(c.text).replace(/\s+/g, " ").trim();
    const info = (a: RawItem) => page.fonts[a.font] ?? FALLBACK,
      total = g.reduce((n, a) => n + chars(a), 0),
      fam = new Map<Paragraph["font"], number>();
    for (const a of g) fam.set(info(a).family, (fam.get(info(a).family) ?? 0) + chars(a));
    const real = cells.filter((c) => c.text);
    if (!real.length) continue;
    lines.push({
      page: index,
      y: g[0].y,
      size,
      x0: real[0].x0,
      x1: real[real.length - 1].x1,
      cells: real,
      text: "",
      bold: g.reduce((n, a) => n + (info(a).bold ? chars(a) : 0), 0) > total * 0.6,
      italic: g.reduce((n, a) => n + (info(a).italic ? chars(a) : 0), 0) > total * 0.6,
      family: [...fam.entries()].sort((a, b) => b[1] - a[1])[0][0],
      cls: "left",
      centered: false,
      full: false,
      edge: g[0].y > page.height * 0.93 ? "top" : g[0].y < page.height * 0.07 ? "bottom" : "",
      bullet: false,
      marker: false,
    });
  }
  return { lines, skipped };
}
const joinCells = (cells: Cell[], size: number) =>
  cells.reduce((s, c, i) => (i ? s + (c.gap > 3.5 * size ? "\t" : " ") + c.text : c.text), "");
// Márgenes del texto en la hoja: el borde izquierdo más usado y el derecho donde terminan los renglones llenos.
function frameOf(lines: Line[], width: number): Frame {
  if (!lines.length) return { left: 0, right: width, mid: width / 2 };
  const b = (n: number) => Math.round(n / 1.5) * 1.5,
    counts = new Map<number, number>();
  for (const l of lines) counts.set(b(l.x0), (counts.get(b(l.x0)) ?? 0) + 1);
  const need = Math.max(2, Math.ceil(lines.length * 0.2)),
    keys = [...counts.keys()].sort((a, c) => a - c),
    left = keys.find((k) => (counts.get(k) ?? 0) >= need) ?? keys[0],
    rights = new Map<number, number>();
  let widest = -Infinity;
  for (const l of lines)
    if (Math.abs(l.x0 - left) <= 3) {
      rights.set(b(l.x1), (rights.get(b(l.x1)) ?? 0) + 1);
      widest = Math.max(widest, l.x1);
    }
  const repeated = [...rights.entries()].filter(([, n]) => n >= 2).map(([k]) => k),
    right = Math.max(repeated.length ? Math.max(...repeated) : widest, left + 50);
  return { left, right, mid: (left + right) / 2 };
}
function classify(lines: Line[], f: Frame, width: number) {
  const W = f.right - f.left;
  for (const l of lines) {
    const tol = 0.03 * W + 2,
      mid = (l.x0 + l.x1) / 2;
    l.text = joinCells(l.cells, l.size);
    l.centered = l.cells.length === 1 && (Math.abs(mid - f.mid) <= tol || Math.abs(mid - width / 2) <= tol);
    const endsRight = l.x1 >= f.right - Math.max(0.045 * W, 2.2 * l.size),
      wide = l.x1 - l.x0 >= 0.55 * W;
    // Llega al borde derecho y es largo: texto corrido (también si está sangrado). Corto y pegado a la derecha: texto a la derecha.
    l.full = endsRight && wide;
    if (l.full) l.cls = "left";
    else if (endsRight && l.x0 - f.left > 0.3 * W) l.cls = "right";
    else if (l.centered && l.x0 - f.left > 0.04 * W) l.cls = "center";
    else l.cls = "left";
    l.bullet = BULLET.test(l.text);
    l.marker = MARKER.test(l.text);
  }
  // Renglones que empiezan en el mismo punto pero terminan distinto son texto sangrado a la izquierda, no centrado.
  lines.forEach((l, i) => {
    if (l.cls !== "center") return;
    for (const n of [lines[i - 1], lines[i + 1]])
      if (n && Math.abs(n.y - l.y) <= 2.7 * l.size && Math.abs(n.x0 - l.x0) <= 1.5 && Math.abs(n.x1 - l.x1) > 3) l.cls = "left";
  });
  // Un renglón centrado que ocupa todo el ancho (título largo) es del centro si su vecino lo es.
  lines.forEach((l, i) => {
    if (l.cls !== "left" || !l.full || !l.centered) return;
    for (const n of [lines[i - 1], lines[i + 1]])
      if (n && n.cls === "center" && Math.abs(n.size - l.size) < 0.8 && n.bold === l.bold && Math.abs(n.y - l.y) <= 2.7 * l.size) l.cls = "center";
  });
}
// Filas de tabla: renglones seguidos con varias celdas separadas.
function findTables(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let tables = 0;
  for (let i = 0; i < lines.length; ) {
    const start = lines[i];
    let j = i;
    if (start.cells.length >= 2 && start.cells.length <= MAX_TABLE_COLS)
      while (
        j + 1 < lines.length &&
        lines[j + 1].cells.length >= 2 &&
        lines[j + 1].cells.length <= MAX_TABLE_COLS &&
        lines[j].y - lines[j + 1].y <= 3.6 * start.size
      )
        j++;
    const rows = lines.slice(i, j + 1),
      cols = Math.max(0, ...rows.map((r) => r.cells.length));
    // Al menos 3 renglones o 3 columnas: así un «Nombre … Fecha …» suelto no se vuelve tabla.
    if (rows.length >= 2 && (rows.length >= 3 || cols >= 3) && tables < MAX_TABLES) {
      const ref = rows.find((r) => r.cells.length === cols)!,
        centers = ref.cells.map((c) => (c.x0 + c.x1) / 2),
        grid: string[][] = [];
      let ok = true;
      for (const r of rows) {
        const row = Array.from({ length: cols }, () => "");
        if (r.cells.length === cols) r.cells.forEach((c, k) => (row[k] = c.text));
        else
          for (const c of r.cells) {
            const mid = (c.x0 + c.x1) / 2,
              k = centers.reduce((best, x, n) => (Math.abs(x - mid) < Math.abs(centers[best] - mid) ? n : best), 0);
            if (row[k]) ok = false;
            row[k] = c.text;
          }
        grid.push(row.map((c) => c.slice(0, MAX_TABLE_CELL)));
      }
      if (ok) {
        blocks.push({ kind: "table", rows: grid, size: Math.round(median(rows.map((r) => r.size))), page: rows[0].page, y: rows[rows.length - 1].y, first: rows[0].y });
        tables++;
        i = j + 1;
        continue;
      }
    }
    blocks.push({ kind: "line", line: start });
    i++;
  }
  return blocks;
}
const norm = (s: string) => s.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
type Draft = { lines: Line[]; seps: string[]; left: number; pageBreak: boolean };
export function layoutPages(pages: LayoutPage[]): LayoutResult {
  let skipped = 0,
    pageNumbers = false,
    headers = 0;
  const all = pages.map((p, i) => {
    const r = buildLines(p, i);
    skipped += r.skipped;
    return r.lines;
  });
  // Números de página y encabezados o pies repetidos: no son parte del texto.
  const zone = (l: Line, h: number) => (l.y > h * 0.93 ? "top" : l.y < h * 0.07 ? "bottom" : ""),
    textOf = (l: Line) => l.cells.map((c) => c.text).join(" "),
    seen = new Map<string, number[]>();
  all.forEach((lines, i) =>
    lines.forEach((l) => {
      const z = zone(l, pages[i].height);
      if (z) seen.set(z + "|" + norm(textOf(l)), [...(seen.get(z + "|" + norm(textOf(l))) ?? []), i]);
    }),
  );
  const drop = new Set<Line>();
  all.forEach((lines, i) =>
    lines.forEach((l) => {
      const z = zone(l, pages[i].height);
      if (!z) return;
      const where = seen.get(z + "|" + norm(textOf(l))) ?? [];
      if (PAGE_NUMBER.test(textOf(l))) {
        drop.add(l);
        pageNumbers = true;
      } else if (where.length >= 2 && pages.length >= 2 && i !== (z === "top" ? where[0] : where[where.length - 1])) {
        drop.add(l);
        headers++;
      }
    }),
  );
  const kept = all.map((lines) => lines.filter((l) => !drop.has(l))),
    docFrame = frameOf(kept.flat(), pages[0]?.width ?? 612),
    frames = kept.map((lines, i) => (lines.length >= 8 ? frameOf(lines, pages[i].width) : docFrame));
  kept.forEach((lines, i) => classify(lines, frames[i], pages[i].width));
  // Separación normal entre renglones de cada tamaño (el paso más corto que se repite).
  const pitch = new Map<number, number>(),
    gaps = new Map<number, number[]>();
  for (const lines of kept)
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1],
        b = lines[i],
        g = a.y - b.y;
      if (Math.abs(a.size - b.size) < 0.8 && a.cls === b.cls && g >= 0.9 * b.size && g <= 2.7 * b.size)
        gaps.set(Math.round(b.size), [...(gaps.get(Math.round(b.size)) ?? []), Math.round(g * 2) / 2]);
    }
  for (const [k, list] of gaps) {
    const freq = new Map<number, number>();
    for (const g of list) freq.set(g, (freq.get(g) ?? 0) + 1);
    const regular = [...freq.entries()].filter(([, n]) => n >= 2).map(([g]) => g);
    pitch.set(k, regular.length ? Math.min(...regular) : Math.min(...list));
  }
  const ref = (size: number) => {
    const k = Math.round(size),
      own = pitch.get(k);
    if (own) return own;
    const near = [...pitch.entries()].sort((a, b) => Math.abs(a[0] - k) - Math.abs(b[0] - k))[0];
    return near ? (near[1] / near[0]) * size : 1.25 * size;
  };
  // Bordes derechos que se repiten en la hoja = texto justificado (un párrafo de 2 renglones también lo cumple).
  const edges = new Map<number, number>();
  for (const l of kept.flat()) if (l.full) edges.set(Math.round(l.x1 / 1.5), (edges.get(Math.round(l.x1 / 1.5)) ?? 0) + 1);
  const bodySize = median(kept.flat().map((l) => l.size)),
    body = kept.flat().filter((l) => !l.edge),
    // Fondo del texto: el renglón más bajo de todo el documento o, si las hojas quedan cortas, el margen de arriba reflejado.
    bottom = Math.min(...(body.length ? body : kept.flat()).map((l) => l.y), (pages[0]?.height ?? 792) - Math.max(...(body.length ? body : kept.flat()).map((l) => l.y))),
    out: Paragraph[] = [];
  let cur: Draft | null = null;
  const flush = () => {
    if (!cur) return;
    const d = cur,
      first = d.lines[0],
      p = paragraph();
    cur = null;
    let text = d.lines.map((l, i) => (i ? d.seps[i - 1] : "") + l.text).join("");
    if (first.bullet) {
      text = text.replace(BULLET, "");
      p.list = "bullet";
    }
    p.text = text.replace(/ {2,}/g, " ");
    p.size = clampSize(median(d.lines.map((l) => l.size)));
    p.bold = d.lines.filter((l) => l.bold).length > d.lines.length / 2;
    p.italic = d.lines.filter((l) => l.italic).length > d.lines.length / 2;
    p.font = first.family;
    p.align = first.cls;
    // Justificado: todos los renglones menos el último terminan exactamente en el mismo borde derecho.
    const body = d.lines.slice(0, -1);
    if (first.cls === "left" && body.length >= 1 && body.every((l) => l.full)) {
      const xs = body.map((l) => l.x1);
      const spread = Math.max(...xs) - Math.min(...xs),
        common = [...edges.entries()].sort((x, y) => y[1] - x[1])[0];
      // Con un solo renglón lleno la prueba es más estricta: tiene que caer exactamente en el borde que comparten los demás.
      if ((body.length >= 2 && spread <= 1.6) || (body.length === 1 && common && common[1] >= 3 && Math.abs(xs[0] - common[0] * 1.5) <= 0.8)) p.align = "justify";
    }
    const indent = Math.round((Math.min(...d.lines.map((l) => l.x0)) - d.left) / UNIT);
    if (first.cls === "left" && indent >= 1 && !p.list) p.indent = Math.min(MAX_INDENT, indent);
    if (d.pageBreak) p.pageBreak = true;
    out.push(p);
  };
  // ¿El renglón anterior terminó porque ya no cabía la primera palabra del siguiente? Entonces el texto sigue.
  const wrapped = (prev: Line, next: Line, f: Frame) => {
    if (prev.full) return true;
    const avg = (prev.x1 - prev.x0) / Math.max(1, prev.text.length),
      word = next.text.split(" ")[0].length;
    return prev.x1 + avg * (word + 1) > f.right - 0.5 * avg;
  };
  let prev: Line | null = null,
    tail: { page: number; y: number; size: number } | null = null;
  kept.forEach((lines, pi) => {
    const f = frames[pi];
    for (const b of findTables(lines)) {
      if (b.kind === "table") {
        flush();
        const t = paragraph();
        t.table = b.rows;
        t.size = clampSize(b.size);
        if (tail && tail.page !== b.page && tail.y - bottom > 4 * ref(tail.size)) t.pageBreak = true;
        out.push(t);
        prev = null;
        tail = { page: b.page, y: b.y, size: b.size };
        continue;
      }
      const l = b.line,
        samePage = prev !== null && prev.page === l.page;
      let join = false,
        sep = " ";
      if (cur && prev) {
        const alike =
          l.cls === prev.cls &&
          Math.abs(l.size - prev.size) < 0.8 &&
          l.bold === prev.bold &&
          !l.bullet &&
          (l.cls !== "left" || l.x0 <= prev.x0 + 2.5 || prev.marker);
        const g = prev.y - l.y,
          own = cur.lines.length >= 2 ? cur.lines[cur.lines.length - 2].y - prev.y : 0,
          ahead = lines[lines.indexOf(l) + 1],
          // Interlineado de 1.5 o doble: el paso se confirma con el renglón de adelante o con los anteriores del mismo párrafo.
          spaced =
            g <= 2.7 * l.size &&
            wrapped(prev, l, f) &&
            (own ? Math.abs(g - own) <= 0.8 : !!ahead && ahead.cls === l.cls && Math.abs(l.y - ahead.y - g) <= 0.8 && wrapped(l, ahead, f));
        if (samePage && alike && (g <= ref(l.size) * 1.12 + 0.6 || spaced)) {
          if (wrapped(prev, l, f)) join = true;
          else if (END_SENTENCE.test(prev.text) && /^[A-ZÁÉÍÓÚÑ0-9¿¡"«(]/.test(l.text) && l.cls === "left") join = false;
          else {
            join = true;
            sep = "\n";
          }
        } else if (!samePage && alike && l.cls === "left" && wrapped(prev, l, f) && !END_SENTENCE.test(prev.text)) join = true;
      }
      if (join && cur) {
        const d: Draft = cur,
          last = d.lines[d.lines.length - 1];
        if (sep === " " && /[a-záéíóúñü]-$/i.test(last.text) && /^[a-záéíóúñü]/.test(l.text)) {
          last.text = last.text.slice(0, -1);
          sep = "";
        }
        d.lines.push(l);
        d.seps.push(sep);
      } else {
        flush();
        // Espacio en blanco de la hoja → párrafos vacíos (la firma, el espacio antes de «Atentamente»…).
        let n = 0;
        if (samePage && prev) {
          const g = prev.y - l.y,
            r = ref(l.size);
          n = g - r < 12 || l.edge === "bottom" ? 0 : Math.max(0, Math.min(4, Math.round((g - r - 8) / (r + 8))));
        }
        for (let k = 0; k < n; k++) {
          const e = paragraph();
          e.size = clampSize(l.size);
          out.push(e);
        }
        // Salto de página: solo si la hoja anterior terminó con mucho espacio libre (si no, es el texto que siguió de largo).
        const heading = l.cls === "center" || (l.bold && l.size >= bodySize * 1.15) || l.size >= bodySize * 1.3,
          pageBreak = tail !== null && tail.page !== l.page && (tail.y - bottom > 4 * ref(tail.size) || heading);
        cur = {
          lines: [l],
          seps: [],
          left: f.left,
          pageBreak,
        };
      }
      prev = l;
      tail = { page: l.page, y: l.y, size: l.size };
    }
  });
  flush();
  // Quita párrafos vacíos al inicio y al final.
  while (out.length && !out[0].text && !out[0].table) out.shift();
  while (out.length && !out[out.length - 1].text && !out[out.length - 1].table) out.pop();
  return { paragraphs: out, pageNumbers, tables: out.filter((p) => p.table).length, skipped, headers };
}
