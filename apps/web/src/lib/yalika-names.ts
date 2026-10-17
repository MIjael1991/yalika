// Lista de nombres: de un mensaje pegado (WhatsApp, Word, correo…) saca una persona por fila y separa
// nombre(s), apellido paterno y apellido materno. Todo se hace en el dispositivo, sin enviar nada.
import { paragraph, parseDocument, MAX_TABLE_ROWS, type YalikaDocument } from "./yalika-document";
export type NameRow = { nombres: string; paterno: string; materno: string; telefono: string };
export type NamesResult = { rows: NameRow[]; skipped: string[]; cut: boolean };
export const MAX_NAMES = MAX_TABLE_ROWS - 1;
export const MAX_NAMES_TEXT = 60000;
// Palabras que forman parte de un apellido compuesto («de la Cruz», «del Valle», «van Gogh»).
const PARTICLES = new Set(["de", "del", "la", "las", "los", "le", "les", "da", "das", "do", "dos", "di", "du", "van", "von", "der", "den", "ter", "san", "santa", "st", "al", "el", "bin", "ben", "ibn", "mc", "mac"]);
const isParticle = (w: string) => PARTICLES.has(w.toLowerCase().replace(/\.$/, ""));
// Avisos y saludos que no son nombres.
const NOT_NAMES = /^(hola|buen[oa]?s?|saludos|gracias|favor|por|adjunto|lista|listado|nombres?|alumnos?|asistentes?|participantes?|estimad[oa]s?|atte|atentamente|ok|nota|fecha|total)\b/i;
const letters = /\p{L}/u;
export const fullName = (r: Pick<NameRow, "nombres" | "paterno" | "materno">) => [r.nombres, r.paterno, r.materno].filter(Boolean).join(" ");
// Junta las partículas con el apellido que las sigue: «de la Cruz» cuenta como una sola palabra.
function units(words: string[]) {
  const out: string[] = [];
  let i = words.length - 1;
  while (i >= 0) {
    let j = i;
    while (j > 0 && isParticle(words[j - 1])) j--;
    out.unshift(words.slice(j, i + 1).join(" "));
    i = j - 1;
  }
  return out;
}
const upper = (w: string) => w.charAt(0).toLocaleUpperCase("es") + w.slice(1);
// «JUAN PÉREZ» o «juan pérez» pasan a «Juan Pérez»; lo escrito con mayúsculas y minúsculas mezcladas no se toca.
function tidyCase(text: string) {
  if (text !== text.toLocaleUpperCase("es") && text !== text.toLocaleLowerCase("es")) return text;
  return text
    .toLocaleLowerCase("es")
    .split(" ")
    .map((w, i) => (i > 0 && isParticle(w) ? w : w.split("-").map(upper).join("-")))
    .join(" ");
}
// Regla: las dos últimas palabras son los apellidos; lo anterior es el nombre (o los nombres).
export function splitName(text: string): Pick<NameRow, "nombres" | "paterno" | "materno"> {
  const u = units(tidyCase(text).split(/\s+/).filter(Boolean));
  if (u.length <= 1) return { nombres: u[0] ?? "", paterno: "", materno: "" };
  if (u.length === 2) return { nombres: u[0], paterno: u[1], materno: "" };
  return { nombres: u.slice(0, -2).join(" "), paterno: u[u.length - 2], materno: u[u.length - 1] };
}
// «Pérez López, Juan Carlos»: los apellidos vienen primero.
function splitSurnameFirst(left: string, right: string): Pick<NameRow, "nombres" | "paterno" | "materno"> {
  const sur = units(tidyCase(left).split(/\s+/).filter(Boolean));
  return { nombres: tidyCase(right), paterno: sur[0] ?? "", materno: sur.slice(1).join(" ") };
}
const PHONE = /\+?\d[\d\s().-]{5,}\d/;
function phoneOf(line: string): [string, string] {
  const m = PHONE.exec(line);
  if (!m) return [line, ""];
  const digits = m[0].replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return [line, ""];
  const shown = digits.length === 10 ? digits.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3") : m[0].trim().replace(/\s+/g, " ");
  return [line.replace(m[0], " "), shown];
}
const BULLET = /^\s*(?:[-–—•*·▪●◦>]+\s*|\(?\d{1,3}\s*[.)\-–:]\s+|\(\d{1,3}\)\s*)/;
// Tratamientos al inicio («Lic.», «Dra.», «Sr.») que no forman parte del nombre.
const TITLES = /^(?:(?:sr|sra|srita|dr|dra|lic|licda|ing|arq|mtro|mtra|prof|profa)\.?\s+)+/i;
const cleanName = (s: string) =>
  s
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, " ")
    .replace(/\s+-+\s+|\s+\.+\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.'’-]+|[-'’]+$/g, "")
    .trim()
    .replace(TITLES, "");
export function parseNames(input: string): NamesResult {
  const text = input.slice(0, MAX_NAMES_TEXT).replace(/\r/g, ""),
    skipped: string[] = [],
    lines = text
      .split("\n")
      .flatMap((l) => l.split(";"))
      .map((l) => l.trim())
      .filter(Boolean);
  const oneComma = lines.filter((l) => (l.match(/,/g) ?? []).length === 1).length,
    surnameFirst = lines.length > 1 && oneComma / lines.length >= 0.6,
    parts: { raw: string; left?: string; right?: string }[] = [];
  for (const line of lines) {
    const body = line.replace(BULLET, "");
    if (/[:?!]$/.test(body.trim())) {
      skipped.push(line);
      continue;
    }
    const commas = (body.match(/,/g) ?? []).length;
    if (commas === 1 && surnameFirst) {
      const [left, right] = body.split(",");
      parts.push({ raw: line, left, right });
    } else if (commas > 0) body.split(",").forEach((p) => parts.push({ raw: p }));
    else parts.push({ raw: body });
  }
  const rows: NameRow[] = [];
  let cut = false;
  for (const p of parts) {
    let name: string,
      telefono: string,
      split: Pick<NameRow, "nombres" | "paterno" | "materno">;
    if (p.left !== undefined && p.right !== undefined) {
      const [l, pl] = phoneOf(p.left),
        [r, pr] = phoneOf(p.right),
        a = cleanName(l),
        b = cleanName(r);
      name = a + " " + b;
      telefono = pl || pr;
      split = splitSurnameFirst(a, b);
    } else {
      const [w, tel] = phoneOf(p.raw);
      name = cleanName(w);
      telefono = tel;
      split = splitName(name);
    }
    if (!letters.test(name) || name.split(" ").length > 7 || NOT_NAMES.test(name)) {
      if (letters.test(p.raw)) skipped.push(p.raw.trim());
      continue;
    }
    if (rows.length >= MAX_NAMES) {
      cut = true;
      break;
    }
    rows.push({ ...split, telefono });
  }
  return { rows, skipped: skipped.slice(0, 30), cut };
}
const key = (s: string) => s.toLocaleLowerCase("es");
// Orden de lista: por apellido paterno, luego materno y luego nombre.
export function sortNames(rows: NameRow[]): NameRow[] {
  const c = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  return rows.slice().sort((a, b) => c.compare(key(a.paterno || a.nombres), key(b.paterno || b.nombres)) || c.compare(a.materno, b.materno) || c.compare(a.nombres, b.nombres));
}
const hasPhones = (rows: NameRow[]) => rows.some((r) => r.telefono);
// Excel: nombre completo y, a su lado, cada parte en su columna (lista para filtrar u ordenar).
export function namesSheet(rows: NameRow[]): string[][] {
  const phones = hasPhones(rows);
  return [
    ["Nombre completo", "Nombre(s)", "Apellido paterno", "Apellido materno", ...(phones ? ["Teléfono"] : [])],
    ...rows.map((r) => [fullName(r), r.nombres, r.paterno, r.materno, ...(phones ? [r.telefono] : [])]),
  ];
}
// Word: la lista numerada de siempre (No., apellidos y nombre), en una tabla que se repite el encabezado en cada hoja.
export function namesDocument(rows: NameRow[], title: string): YalikaDocument {
  const phones = hasPhones(rows),
    table = [
      ["No.", "Apellido paterno", "Apellido materno", "Nombre(s)", ...(phones ? ["Teléfono"] : [])],
      ...rows.map((r, i) => [String(i + 1), r.paterno, r.materno, r.nombres, ...(phones ? [r.telefono] : [])]),
    ];
  return parseDocument({
    version: 1,
    title: title.slice(0, 160),
    pageNumbers: true,
    paragraphs: [
      { ...paragraph(title.slice(0, 160)), align: "center", bold: true, size: 16 },
      { ...paragraph(rows.length === 1 ? "1 persona" : rows.length + " personas"), align: "center", size: 10 },
      paragraph(""),
      { ...paragraph(""), size: 11, table },
    ],
  });
}
