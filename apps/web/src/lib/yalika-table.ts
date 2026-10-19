// De las palabras que reconoce el OCR (con su posición en la foto) arma filas y columnas para pasarlas a Excel.
// Una lista o un texto normal queda en una sola columna; una tabla o una lista con precios, en varias.
export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };
type Cell = { text: string; x0: number; x1: number };
type Line = { cy: number; h: number; words: OcrWord[]; cells: Cell[] };
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const MAX_TABLE_COLUMNS = 26;
export function wordsToRows(input: OcrWord[]): string[][] {
  const words = input
    .map((w) => ({ ...w, text: w.text.replace(/[\u0000-\u001f]/g, "").trim() }))
    .filter((w) => w.text && [w.x0, w.y0, w.x1, w.y1].every(Number.isFinite) && w.x1 > w.x0 && w.y1 > w.y0);
  if (!words.length) return [];
  const medH = median(words.map((w) => w.y1 - w.y0)),
    cw = median(words.filter((w) => w.text.length >= 2).map((w) => (w.x1 - w.x0) / w.text.length)) || medH * 0.55,
    gapMin = Math.max(2.4 * cw, 0.7 * medH);
  // 1. Líneas: palabras a la misma altura.
  const lines: Line[] = [];
  for (const w of words.slice().sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1))) {
    const cy = (w.y0 + w.y1) / 2,
      h = w.y1 - w.y0,
      last = lines[lines.length - 1];
    if (last && Math.abs(cy - last.cy) <= 0.55 * Math.max(last.h, h)) {
      last.words.push(w);
      last.cy = (last.cy * (last.words.length - 1) + cy) / last.words.length;
      last.h = Math.max(last.h, h);
    } else lines.push({ cy, h, words: [w], cells: [] });
  }
  // 2. Celdas: palabras separadas por un hueco grande empiezan otra celda.
  for (const l of lines) {
    l.words.sort((a, b) => a.x0 - b.x0);
    for (const w of l.words) {
      const cell = l.cells[l.cells.length - 1];
      if (cell && w.x0 - cell.x1 <= gapMin) {
        cell.text += " " + w.text;
        cell.x1 = Math.max(cell.x1, w.x1);
      } else l.cells.push({ text: w.text, x0: w.x0, x1: w.x1 });
    }
  }
  const tableLines = lines.filter((l) => l.cells.length >= 2);
  if (tableLines.length < 2 || tableLines.length < lines.length * 0.3) return lines.map((l) => [l.cells.map((c) => c.text).join(" ")]);
  // 3. Columnas: huecos verticales por donde no pasa casi ninguna celda de las filas de tabla.
  const xs = [...new Set(tableLines.flatMap((l) => l.cells.flatMap((c) => [c.x0, c.x1])))].sort((a, b) => a - b),
    tolerance = Math.floor(tableLines.length * 0.1),
    cuts: number[] = [];
  let gapStart: number | null = null;
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i],
      b = xs[i + 1],
      mid = (a + b) / 2,
      covered = tableLines.filter((l) => l.cells.some((c) => c.x0 <= mid && c.x1 >= mid)).length;
    if (covered <= tolerance) {
      if (gapStart === null) gapStart = a;
    } else if (gapStart !== null) {
      if (a - gapStart >= 1.5 * cw) cuts.push((gapStart + a) / 2);
      gapStart = null;
    }
  }
  // 4. Cada celda va a la columna donde cae su centro (o su inicio, si la línea es un solo texto).
  const col = (x: number) => cuts.filter((c) => c < x).length,
    width = cuts.length + 1,
    rows = lines.map((l) => {
      const row = Array<string>(width).fill("");
      for (const c of l.cells) {
        const j = Math.min(width - 1, col(l.cells.length >= 2 ? (c.x0 + c.x1) / 2 : c.x0));
        row[j] = row[j] ? row[j] + " " + c.text : c.text;
      }
      return row;
    });
  // Sin columnas vacías al final ni al principio.
  let last = width - 1;
  while (last > 0 && rows.every((r) => !r[last])) last--;
  let first = 0;
  while (first < last && rows.every((r) => !r[first])) first++;
  return rows.map((r) => r.slice(first, Math.min(last + 1, first + MAX_TABLE_COLUMNS)));
}
