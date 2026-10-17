// Structured text only: imported files never inject HTML into the editor.
import { isTotalRow, theme } from "./yalika-book";
export const MAX_CHARS = 300000;
export const DOCUMENT_TYPE = "application/vnd.yalika.document+json";
export type Paragraph = {
  text: string;
  font: "Arial" | "Times New Roman" | "Courier New";
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  // Un párrafo puede ser, además de texto: elemento de lista, tabla o imagen (los campos de abajo son opcionales).
  list?: "bullet" | "number";
  table?: string[][];
  image?: Picture;
};
// Imagen guardada como JPEG en base64. w y h son sus píxeles; size es el ancho relativo en la hoja.
export type Picture = { data: string; w: number; h: number; size: "s" | "m" | "l" };
export type YalikaDocument = {
  version: 1;
  title: string;
  paragraphs: Paragraph[];
  pageNumbers?: boolean;
};
export const MAX_TABLES = 20;
export const MAX_TABLE_ROWS = 300;
export const MAX_TABLE_COLS = 8;
export const MAX_TABLE_CELL = 500;
export const MAX_IMAGES = 8;
export const MAX_IMAGE_B64 = 450000;
export const MAX_IMAGES_TOTAL = 1500000;
export const PICTURE_SIZES = { s: 0.33, m: 0.6, l: 1 } as const;
// Tamaño de una imagen en una hoja de `maxWidth` unidades: nunca más grande que su tamaño real.
export function pictureBox(img: Picture, maxWidth: number) {
  const w = Math.min(img.w, maxWidth * PICTURE_SIZES[img.size]);
  return { width: w, height: (w * img.h) / img.w };
}
export function fromBase64(data: string): Uint8Array {
  const bin = atob(data),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function paragraph(text = ""): Paragraph {
  return {
    text,
    font: "Arial",
    size: 12,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
  };
}
export function newDocument(): YalikaDocument {
  return {
    version: 1,
    title: "Documento sin título",
    paragraphs: [paragraph()],
  };
}
export function parseDocument(value: unknown): YalikaDocument {
  if (!value || typeof value !== "object") throw Error("Documento no válido.");
  const d = value as YalikaDocument;
  if (
    d.version !== 1 ||
    typeof d.title !== "string" ||
    d.title.length > 160 ||
    !Array.isArray(d.paragraphs) ||
    !d.paragraphs.length ||
    d.paragraphs.length > 1000
  )
    throw Error("Documento no válido.");
  let length = 0,
    images = 0;
  const paragraphs = d.paragraphs.map((p) => {
    if (
      !p ||
      typeof p.text !== "string" ||
      !["Arial", "Times New Roman", "Courier New"].includes(p.font) ||
      !Number.isInteger(p.size) ||
      p.size < 8 ||
      p.size > 36 ||
      !["left", "center", "right"].includes(p.align) ||
      [p.bold, p.italic, p.underline].some((x) => typeof x !== "boolean")
    )
      throw Error("Formato de documento no válido.");
    length += p.text.length;
    const out: Paragraph = {
      text: p.text,
      font: p.font,
      size: p.size,
      bold: p.bold,
      italic: p.italic,
      underline: p.underline,
      align: p.align,
    };
    if (p.list !== undefined) {
      if (p.list !== "bullet" && p.list !== "number") throw Error("Formato de documento no válido.");
      out.list = p.list;
    }
    if (p.table !== undefined) {
      const t = p.table;
      if (
        !Array.isArray(t) ||
        !t.length ||
        t.length > MAX_TABLE_ROWS ||
        !Array.isArray(t[0]) ||
        !t[0].length ||
        t[0].length > MAX_TABLE_COLS ||
        t.some((r) => !Array.isArray(r) || r.length !== t[0].length || r.some((c) => typeof c !== "string" || c.length > MAX_TABLE_CELL)) ||
        p.text !== "" ||
        p.list !== undefined ||
        p.image !== undefined
      )
        throw Error("La tabla no es válida.");
      length += t.reduce((n, r) => n + r.reduce((m, c) => m + c.length, 0), 0);
      out.table = t.map((r) => r.slice());
    }
    if (p.image !== undefined) {
      const im = p.image;
      if (
        !im ||
        typeof im.data !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(im.data) ||
        im.data.length > MAX_IMAGE_B64 ||
        !Number.isInteger(im.w) ||
        !Number.isInteger(im.h) ||
        im.w < 1 ||
        im.h < 1 ||
        im.w > 4000 ||
        im.h > 4000 ||
        !["s", "m", "l"].includes(im.size) ||
        p.text !== "" ||
        p.list !== undefined ||
        p.table !== undefined
      )
        throw Error("La imagen no es válida.");
      images += im.data.length;
      out.image = { data: im.data, w: im.w, h: im.h, size: im.size };
    }
    return out;
  });
  if (length > MAX_CHARS) throw Error("Máximo " + MAX_CHARS.toLocaleString("en-US") + " caracteres por documento.");
  if (paragraphs.filter((p) => p.table).length > MAX_TABLES) throw Error("Máximo " + MAX_TABLES + " tablas por documento.");
  if (paragraphs.filter((p) => p.image).length > MAX_IMAGES || images > MAX_IMAGES_TOTAL)
    throw Error("Máximo " + MAX_IMAGES + " imágenes por documento.");
  if (d.pageNumbers !== undefined && typeof d.pageNumbers !== "boolean") throw Error("Documento no válido.");
  return { version: 1, title: d.title, paragraphs, ...(d.pageNumbers ? { pageNumbers: true } : {}) };
}
export function documentName(title: string) {
  return (
    title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/[. ]+$/, "")
      .slice(0, 100) || "Documento"
  );
}
export async function exportWord(value: YalikaDocument): Promise<Blob> {
  const d = parseDocument(value);
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    ImageRun,
    LevelFormat,
    Packer,
    PageNumber,
    Paragraph: P,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import("docx");
  const t = theme("yalika"),
    edge = { style: BorderStyle.SINGLE, size: 4, color: t.line };
  const runs = (text: string, p: Paragraph, bold = p.bold, color?: string) =>
    text.split("\n").map(
      (line, i) =>
        new TextRun({
          text: line,
          break: i ? 1 : undefined,
          font: p.font,
          size: p.size * 2,
          bold,
          color,
          italics: p.italic,
          underline: p.underline ? {} : undefined,
        }),
    );
  let run = -1,
    prevNumber = false,
    afterTable = false; // Word pega lo que sigue a una tabla; se deja un poco de aire
  const children = d.paragraphs.map((p) => {
    const isNumber = p.list === "number";
    if (isNumber && !prevNumber) run++;
    prevNumber = isNumber;
    const before = afterTable ? 120 : 0;
    afterTable = !!p.table;
    if (p.table) {
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: edge, bottom: edge, left: edge, right: edge, insideHorizontal: edge, insideVertical: edge },
        rows: p.table.map((row, r) => {
          const total = r > 0 && isTotalRow(row),
            fill = r === 0 ? t.head : total ? t.total : r % 2 === 0 ? t.zebra : undefined;
          return new TableRow({
            tableHeader: r === 0,
            cantSplit: true,
            children: row.map(
              (cell) =>
                new TableCell({
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 70, bottom: 70, left: 110, right: 110 },
                  ...(fill ? { shading: { type: ShadingType.CLEAR, fill, color: "auto" } } : {}),
                  children: [
                    new P({ children: runs(cell, p, r === 0 || total || p.bold, r === 0 ? t.headText : undefined), spacing: { after: 0 } }),
                  ],
                }),
            ),
          });
        }),
      });
    }
    if (p.image) {
      const box = pictureBox(p.image, 600);
      return new P({
        alignment: p.align,
        spacing: { before, after: 160 },
        children: [
          new ImageRun({
            type: "jpg",
            data: fromBase64(p.image.data),
            transformation: { width: Math.round(box.width), height: Math.round(box.height) },
          }),
        ],
      });
    }
    return new P({
      alignment: p.align,
      spacing: { before, after: p.list ? 60 : 160 },
      ...(p.list === "bullet" ? { bullet: { level: 0 } } : {}),
      ...(isNumber ? { numbering: { reference: "yalika-num", level: 0, instance: run } } : {}),
      children: runs(p.text, p),
    });
  });
  return Packer.toBlob(
    new Document({
      title: d.title,
      numbering: {
        config: [
          {
            reference: "yalika-num",
            levels: [
              {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: "%1.",
                alignment: AlignmentType.LEFT,
                style: { run: { font: "Arial" }, paragraph: { indent: { left: 720, hanging: 360 } } },
              },
            ],
          },
        ],
      },
      sections: [
        {
          ...(d.pageNumbers
            ? {
                footers: {
                  default: new Footer({
                    children: [
                      new P({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] }),
                    ],
                  }),
                },
              }
            : {}),
          children,
        },
      ],
    }),
  );
}
// Los textos copiados de Word o PDF traen rayas, comillas y viñetas «tipográficas» que la letra básica del PDF no tiene:
// se cambian por su equivalente sencillo en vez de rechazar todo el documento.
const SIMPLE: [RegExp, string][] = [
  [/[\u2010-\u2015\u2212]/g, "-"],
  [/[\u2018\u2019\u201a\u2032]/g, "'"],
  [/[\u201c\u201d\u201e\u2033]/g, '"'],
  [/\u2026/g, "..."],
  [/[\u2022\u25cf\u25aa\u25e6]/g, "\u00b7"],
  [/[\u200b\u200c\u200d\u2060\ufeff]/g, ""],
  [/[\u2002-\u2009\u202f]/g, " "],
];
export const simpleText = (text: string) => SIMPLE.reduce((t, [re, to]) => t.replace(re, to), text);
export async function exportPdf(value: YalikaDocument): Promise<Blob> {
  const parsed = parseDocument(value);
  const d = {
    ...parsed,
    paragraphs: parsed.paragraphs.map((p) => ({
      ...p,
      text: simpleText(p.text),
      ...(p.table ? { table: p.table.map((r) => r.map(simpleText)) } : {}),
    })),
  };
  // Standard PDF fonts support Spanish/Western Latin; never silently corrupt other scripts.
  const latin = /[^\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff\u20ac]/u;
  if (d.paragraphs.some((p) => latin.test(p.text) || p.table?.some((r) => r.some((c) => latin.test(c)))))
    throw Error(
      "Este PDF básico admite español y caracteres latinos. Para otros símbolos descarga Word.",
    );
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setProperties({ title: d.title });
  let y = 56;
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight(),
    bottom = height - 56,
    contentWidth = width - 112;
  let counter = 0;
  for (const p of d.paragraphs) {
    const font =
      p.font === "Arial"
        ? "helvetica"
        : p.font === "Courier New"
          ? "courier"
          : "times";
    const style = (bold: boolean) =>
      pdf.setFont(font, bold && p.italic ? "bolditalic" : bold ? "bold" : p.italic ? "italic" : "normal");
    if (p.image) {
      counter = 0;
      const box = pictureBox(p.image, contentWidth / 0.75), // las medidas de la imagen son px a 96 dpi; el PDF usa pt
        maxH = bottom - 56,
        k = Math.min(1, maxH / (box.height * 0.75)),
        w = box.width * 0.75 * k,
        h = box.height * 0.75 * k;
      if (y + h > bottom) {
        pdf.addPage();
        y = 56;
      }
      const x = p.align === "center" ? (width - w) / 2 : p.align === "right" ? width - 56 - w : 56;
      pdf.addImage("data:image/jpeg;base64," + p.image.data, "JPEG", x, y, w, h);
      y += h + 8;
      continue;
    }
    if (p.table) {
      counter = 0;
      const rows = p.table,
        colW = contentWidth / rows[0].length,
        pad = 4,
        lh = p.size * 1.3;
      pdf.setFontSize(p.size);
      const rgb = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const,
        th = theme("yalika");
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(...rgb(th.line));
      rows.forEach((row, r) => {
        const total = r > 0 && isTotalRow(row);
        style(r === 0 || total || p.bold);
        const cells: string[][] = row.map((c) => pdf.splitTextToSize(c || " ", colW - 2 * pad - 4)),
          h = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad + 4;
        if (y + h > bottom) {
          pdf.addPage();
          y = 56;
        }
        const fill = r === 0 ? th.head : total ? th.total : r % 2 === 0 ? th.zebra : undefined;
        cells.forEach((lines, c) => {
          if (fill) pdf.setFillColor(...rgb(fill));
          pdf.rect(56 + c * colW, y, colW, h, fill ? "FD" : "S");
          pdf.setTextColor(...(r === 0 ? rgb(th.headText) : ([0, 0, 0] as const)));
          lines.forEach((line, li) => pdf.text(line, 56 + c * colW + pad + 2, y + pad + 2 + p.size + li * lh));
        });
        pdf.setTextColor(0, 0, 0);
        y += h;
      });
      pdf.setDrawColor(0, 0, 0);
      y += 8 + p.size * 1.4;
      continue;
    }
    style(p.bold);
    pdf.setFontSize(p.size);
    counter = p.list === "number" ? counter + 1 : 0;
    const indent = p.list ? 22 : 0,
      lines: string[] = pdf.splitTextToSize(p.text || " ", contentWidth - indent);
    lines.forEach((line, li) => {
      if (y + p.size * 1.4 > bottom) {
        pdf.addPage();
        y = 56;
      }
      const left = 56 + indent,
        x = p.align === "center" ? (left + width - 56) / 2 : p.align === "right" ? width - 56 : left;
      if (li === 0 && p.list === "bullet") pdf.circle(56 + 8, y - p.size * 0.3, 1.8, "F");
      if (li === 0 && p.list === "number") pdf.text(counter + ".", 56 + 14, y, { align: "right" });
      pdf.text(line, x, y, { align: p.align });
      if (p.underline) {
        const w = pdf.getTextWidth(line),
          start = p.align === "center" ? x - w / 2 : p.align === "right" ? x - w : x;
        pdf.line(start, y + 2, start + w, y + 2);
      }
      y += p.size * 1.4;
    });
    y += p.list ? 3 : 8;
  }
  if (d.pageNumbers) {
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(String(i), width / 2, height - 30, { align: "center" });
    }
  }
  return pdf.output("blob");
}
