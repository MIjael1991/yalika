// Plantillas de documentos de uso diario: se llenan unos campos y salen como documento editable (y de ahí a Word o PDF).
// Todo ocurre en el dispositivo; un campo vacío deja una línea para llenar a mano.
import { paragraph, parseDocument, type Paragraph, type YalikaDocument } from "./yalika-document";
export type TemplateField = { id: string; label: string; hint?: string; multiline?: boolean };
export type DocTemplate = {
  id: string;
  label: string;
  hint: string;
  fields: TemplateField[];
  build(v: Record<string, string>): Paragraph[];
};
export const MAX_FIELD = 4000;
const BLANK = "____________________";
const val = (v: Record<string, string>, id: string) => (v[id] ?? "").trim() || BLANK;
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const P = (text = "", o: Partial<Paragraph> = {}): Paragraph => ({ ...paragraph(text), ...o });
const gap = () => P("");
const right = (t: string) => P(t, { align: "right" });
const title = (t: string) => P(t, { align: "center", bold: true, size: 16 });
const head = (t: string) => P(t, { bold: true });
const list = (text: string) => {
  const l = lines(text);
  return l.length ? l.map((x) => P("• " + x)) : [P(BLANK)];
};
const body = (text: string) => {
  const l = lines(text);
  return l.length ? l.map((x) => P(x)) : [P(BLANK), P(BLANK)];
};
const sign = (name: string, role: string) => [
  gap(),
  gap(),
  P("______________________________", { align: "center" }),
  P(name, { align: "center", bold: true }),
  P(role, { align: "center" }),
];
export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: "oficio",
    label: "Oficio",
    hint: "Comunicado formal con asunto y destinatario.",
    fields: [
      { id: "lugar", label: "Lugar y fecha", hint: "Guadalajara, Jal., 16 de octubre de 2026" },
      { id: "numero", label: "Número de oficio" },
      { id: "asunto", label: "Asunto" },
      { id: "para", label: "Dirigido a (nombre)" },
      { id: "cargo", label: "Cargo del destinatario" },
      { id: "cuerpo", label: "Texto del oficio", multiline: true, hint: "Un párrafo por línea." },
      { id: "de", label: "Quien firma (nombre)" },
      { id: "decargo", label: "Cargo de quien firma" },
    ],
    build: (v) => [
      right(val(v, "lugar")),
      right("Oficio No. " + val(v, "numero")),
      right("Asunto: " + val(v, "asunto")),
      gap(),
      head(val(v, "para")),
      P(val(v, "cargo")),
      P("PRESENTE", { bold: true }),
      gap(),
      ...body(v.cuerpo ?? ""),
      gap(),
      P("Sin otro particular, le envío un cordial saludo."),
      P("ATENTAMENTE", { align: "center", bold: true }),
      ...sign(val(v, "de"), val(v, "decargo")),
    ],
  },
  {
    id: "acta",
    label: "Acta de visita",
    hint: "Registro de una visita con asuntos revisados y pendientes.",
    fields: [
      { id: "lugar", label: "Lugar o escuela" },
      { id: "fecha", label: "Fecha y hora" },
      { id: "visita", label: "Quién realiza la visita" },
      { id: "atiende", label: "Quién atiende" },
      { id: "revisado", label: "Asuntos revisados", multiline: true, hint: "Uno por línea." },
      { id: "pendientes", label: "Pendientes y acuerdos", multiline: true, hint: "Uno por línea." },
    ],
    build: (v) => [
      title("ACTA DE VISITA"),
      gap(),
      P("Lugar: " + val(v, "lugar")),
      P("Fecha y hora: " + val(v, "fecha")),
      P("Visita realizada por: " + val(v, "visita")),
      P("Atendió: " + val(v, "atiende")),
      gap(),
      head("Asuntos revisados"),
      ...list(v.revisado ?? ""),
      gap(),
      head("Pendientes y acuerdos"),
      ...list(v.pendientes ?? ""),
      gap(),
      P("Firman de conformidad:"),
      ...sign(val(v, "visita"), "Quien realiza la visita"),
      ...sign(val(v, "atiende"), "Quien atiende"),
    ],
  },
  {
    id: "constancia",
    label: "Constancia",
    hint: "Hace constar un hecho o situación de una persona.",
    fields: [
      { id: "institucion", label: "Institución o escuela" },
      { id: "nombre", label: "Nombre de la persona" },
      { id: "motivo", label: "Qué se hace constar", multiline: true },
      { id: "lugar", label: "Lugar y fecha" },
      { id: "firma", label: "Quien firma (nombre)" },
      { id: "cargo", label: "Cargo de quien firma" },
    ],
    build: (v) => [
      title(val(v, "institucion").toUpperCase()),
      gap(),
      title("CONSTANCIA"),
      gap(),
      P("A quien corresponda:"),
      gap(),
      P("Por medio de la presente se hace constar que " + val(v, "nombre") + ":"),
      ...body(v.motivo ?? ""),
      gap(),
      P("Se extiende la presente a petición del interesado para los fines que a este convengan."),
      gap(),
      right(val(v, "lugar")),
      ...sign(val(v, "firma"), val(v, "cargo")),
    ],
  },
  {
    id: "carta",
    label: "Carta",
    hint: "Carta sencilla de solicitud o aviso.",
    fields: [
      { id: "lugar", label: "Lugar y fecha" },
      { id: "para", label: "Destinatario" },
      { id: "cuerpo", label: "Texto de la carta", multiline: true, hint: "Un párrafo por línea." },
      { id: "de", label: "Tu nombre" },
    ],
    build: (v) => [
      right(val(v, "lugar")),
      gap(),
      head(val(v, "para")),
      gap(),
      P("Reciba un cordial saludo."),
      gap(),
      ...body(v.cuerpo ?? ""),
      gap(),
      P("Agradezco de antemano su atención."),
      gap(),
      P("Atentamente,"),
      ...sign(val(v, "de"), ""),
    ],
  },
  {
    id: "informe",
    label: "Informe",
    hint: "Resumen de actividades y resultados de un periodo.",
    fields: [
      { id: "titulo", label: "Título del informe" },
      { id: "periodo", label: "Periodo" },
      { id: "autor", label: "Elaborado por" },
      { id: "antecedentes", label: "Antecedentes", multiline: true },
      { id: "actividades", label: "Actividades realizadas", multiline: true, hint: "Una por línea." },
      { id: "resultados", label: "Resultados", multiline: true },
      { id: "conclusiones", label: "Conclusiones", multiline: true },
    ],
    build: (v) => [
      title(val(v, "titulo")),
      P("Periodo: " + val(v, "periodo"), { align: "center" }),
      P("Elaborado por: " + val(v, "autor"), { align: "center" }),
      gap(),
      head("1. Antecedentes"),
      ...body(v.antecedentes ?? ""),
      gap(),
      head("2. Actividades realizadas"),
      ...list(v.actividades ?? ""),
      gap(),
      head("3. Resultados"),
      ...body(v.resultados ?? ""),
      gap(),
      head("4. Conclusiones"),
      ...body(v.conclusiones ?? ""),
    ],
  },
];
export const templateById = (id: string) => DOC_TEMPLATES.find((t) => t.id === id);
export function buildFromTemplate(id: string, values: Record<string, string>): YalikaDocument {
  const t = templateById(id);
  if (!t) throw Error("Esa plantilla no existe.");
  for (const f of t.fields) if ((values[f.id] ?? "").length > MAX_FIELD) throw Error("«" + f.label + "» es demasiado largo.");
  const name = (values.titulo || values.nombre || values.asunto || values.lugar || "").trim().slice(0, 60);
  return parseDocument({ version: 1, title: name ? t.label + " - " + name : t.label, paragraphs: t.build(values) });
}
