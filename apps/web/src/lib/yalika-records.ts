// Expedientes: plantillas, requisitos, visitas y paquete de entrega. Lógica pura, sin almacenamiento.
export type RecordKind = "escuela" | "persona";
export type Requirement = { id: string; label: string; required: boolean };
export type FieldDef = { id: string; label: string };
export type TemplateId = "escuela" | "adulto_mayor" | "beneficiario" | "contraloria";
export type Template = {
  id: TemplateId;
  version: 1;
  label: string;
  kind: RecordKind;
  prefix: string;
  fields: FieldDef[];
  requirements: Requirement[];
};
export type Pending = { id: string; text: string; done: boolean };
export type Visit = {
  id: string;
  date: string;
  who: string;
  notes: string;
  pending: Pending[];
  createdAt: string;
};
export type Expediente = {
  id: string;
  folio: string;
  templateId: TemplateId;
  templateVersion: 1;
  kind: RecordKind;
  name: string;
  fields: Record<string, string>;
  requirements: Requirement[]; // copia de la plantilla al crear: cambiar la plantilla no altera expedientes viejos
  na: string[]; // requisitos marcados como "no aplica"
  counts: Record<string, number>; // archivos por requisito (se actualiza junto con cada archivo)
  visits: Visit[];
  createdAt: string;
  updatedAt: string;
};
export type RecordFile = {
  id: string;
  recordId: string;
  requirementId: string;
  visitId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  blob: Blob;
};
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const r = (id: string, label: string, required = true): Requirement => ({ id, label, required });
const f = (id: string, label: string): FieldDef => ({ id, label });
export const TEMPLATES: Template[] = [
  {
    id: "escuela",
    version: 1,
    label: "Escuela",
    kind: "escuela",
    prefix: "ESC",
    fields: [
      f("cct", "Clave de centro de trabajo (CCT)"), f("nivel", "Nivel educativo"), f("turno", "Turno"),
      f("zona", "Zona escolar"), f("sector", "Sector"), f("domicilio", "Domicilio"), f("cp", "Código postal"),
      f("localidad", "Localidad"), f("municipio", "Municipio"), f("estado", "Estado"),
      f("director", "Director o directora"), f("telefono", "Teléfono"),
    ],
    requirements: [
      r("identificacion", "Identificación de la escuela"), r("oficial", "Documento oficial"),
      r("director_doc", "Director o directora con documento"), r("fachada", "Fachada"),
      r("acceso", "Acceso principal"), r("instalaciones", "Instalaciones"),
      r("contraloria", "Contraloría"), r("avisos", "Avisos"), r("extra", "Evidencia adicional", false),
    ],
  },
  {
    id: "adulto_mayor",
    version: 1,
    label: "Adulto mayor",
    kind: "persona",
    prefix: "ADM",
    fields: [
      f("curp", "CURP"), f("telefono", "Teléfono"), f("correo", "Correo"), f("domicilio", "Domicilio"),
      f("colonia", "Colonia o localidad"), f("municipio", "Municipio"), f("cp", "Código postal"),
      f("programa", "Programa"), f("beneficiario", "Número de beneficiario"),
    ],
    requirements: [
      r("ine_frente", "INE (frente)"), r("ine_reverso", "INE (reverso)", false), r("curp", "CURP"),
      r("comprobante", "Comprobante de domicilio"), r("foto", "Fotografía de la persona"),
      r("tarjeta", "Tarjeta", false), r("firma", "Firma"),
    ],
  },
  {
    id: "beneficiario",
    version: 1,
    label: "Beneficiario",
    kind: "persona",
    prefix: "BEN",
    fields: [
      f("curp", "CURP"), f("telefono", "Teléfono"), f("correo", "Correo"), f("domicilio", "Domicilio"),
      f("municipio", "Municipio"), f("cp", "Código postal"), f("programa", "Programa"),
      f("beneficiario", "Número de beneficiario"),
    ],
    requirements: [
      r("identificacion", "Identificación"), r("solicitud", "Solicitud"), r("evidencia", "Evidencia"),
      r("comprobante", "Comprobante"), r("entrega", "Entrega", false),
    ],
  },
  {
    id: "contraloria",
    version: 1,
    label: "Contraloría",
    kind: "escuela",
    prefix: "CON",
    fields: [f("responsable", "Persona responsable"), f("lugar", "Lugar"), f("fecha", "Fecha"), f("observaciones", "Observaciones")],
    requirements: [r("documento", "Documento"), r("evidencia", "Evidencia fotográfica"), r("extra", "Anexos", false)],
  },
];
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
export function nextFolio(prefix: string, folios: string[]) {
  let max = 0;
  for (const x of folios) {
    const m = new RegExp("^" + prefix + "-(\\d{6})$").exec(x);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return prefix + "-" + String(max + 1).padStart(6, "0");
}
const clean = (s: string, max: number) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
export function newExpediente(
  t: Template,
  folios: string[],
  name: string,
  fields: Record<string, string>,
  id: string,
  now: string,
): Expediente {
  const nm = clean(name, 160);
  if (nm.length < 2) throw Error("Escribe el nombre del expediente.");
  const out: Record<string, string> = {};
  for (const d of t.fields) {
    const v = clean(fields[d.id] ?? "", 200);
    if (v) out[d.id] = v;
  }
  return {
    id,
    folio: nextFolio(t.prefix, folios),
    templateId: t.id,
    templateVersion: t.version,
    kind: t.kind,
    name: nm,
    fields: out,
    requirements: t.requirements.map((x) => ({ ...x })),
    na: [],
    counts: {},
    visits: [],
    createdAt: now,
    updatedAt: now,
  };
}
// Un requisito cuenta cuando tiene al menos un archivo. Tener archivo NO significa que esté revisado ni aprobado.
export function completeness(e: Expediente, counts: Record<string, number>) {
  const applicable = e.requirements.filter((x) => x.required && !e.na.includes(x.id)),
    missing = applicable.filter((x) => !(counts[x.id] > 0)),
    done = applicable.length - missing.length;
  return {
    applicable: applicable.length,
    done,
    percent: applicable.length ? Math.round((done * 100) / applicable.length) : null,
    missing,
  };
}
export function openPending(e: Expediente) {
  return e.visits.flatMap((v) => v.pending.filter((p) => !p.done).map((p) => ({ visit: v, item: p })));
}
const validDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().startsWith(d);
export function addVisit(
  e: Expediente,
  v: { date: string; who: string; notes: string; pending: string[] },
  id: string,
  now: string,
): Expediente {
  if (!validDate(v.date)) throw Error("La fecha de la visita no es válida.");
  const pending = v.pending
    .map((t) => clean(t, 200))
    .filter(Boolean)
    .slice(0, 30)
    .map((text, i) => ({ id: id + "-" + i, text, done: false }));
  const visit: Visit = { id, date: v.date, who: clean(v.who, 120), notes: clean(v.notes, 4000), pending, createdAt: now };
  return { ...e, visits: [...e.visits, visit], updatedAt: now };
}
export function togglePending(e: Expediente, visitId: string, pendingId: string, now: string): Expediente {
  let hit = false;
  const visits = e.visits.map((v) =>
    v.id !== visitId
      ? v
      : { ...v, pending: v.pending.map((p) => (p.id === pendingId ? ((hit = true), { ...p, done: !p.done }) : p)) },
  );
  if (!hit) throw Error("No se encontró el pendiente.");
  return { ...e, visits, updatedAt: now };
}
export function setNotApplicable(e: Expediente, reqId: string, value: boolean, now: string): Expediente {
  const req = e.requirements.find((x) => x.id === reqId);
  if (!req) throw Error("Requisito desconocido.");
  const na = value ? Array.from(new Set([...e.na, reqId])) : e.na.filter((x) => x !== reqId);
  return { ...e, na, updatedAt: now };
}
export function checkRecordFile(file: { name: string; type: string; size: number }) {
  if (!file.size) return "«" + file.name + "» está vacío.";
  if (file.size > MAX_FILE_BYTES) return "«" + file.name + "» pesa más de 20 MB.";
  if (!/^(image\/|application\/pdf$)/.test(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name))
    return "«" + file.name + "»: usa imágenes o PDF.";
  return "";
}
export function safeName(s: string, fallback = "archivo") {
  return (
    s
      .normalize("NFC")
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-")
      .replace(/^[.\s-]+|[.\s-]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 80) || fallback
  );
}
// CSV seguro: comillas dobles y sin fórmulas ejecutables en Excel.
export function csvCell(v: string) {
  const s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function fichaLines(e: Expediente, t: Template | undefined, counts: Record<string, number>) {
  const c = completeness(e, counts),
    lines = ["Expediente " + e.folio, e.name, "Tipo: " + (t?.label ?? e.templateId), ""];
  for (const d of t?.fields ?? []) if (e.fields[d.id]) lines.push(d.label + ": " + e.fields[d.id]);
  lines.push(
    "",
    "REQUISITOS" + (c.percent === null ? "" : " (" + c.done + " de " + c.applicable + " obligatorios con archivo, " + c.percent + "%)"),
  );
  for (const q of e.requirements) {
    const state = e.na.includes(q.id) ? "no aplica" : counts[q.id] > 0 ? counts[q.id] + " archivo(s)" : "falta";
    lines.push("[" + (counts[q.id] > 0 ? "x" : " ") + "] " + q.label + (q.required ? "" : " (opcional)") + " - " + state);
  }
  lines.push("", "VISITAS");
  if (!e.visits.length) lines.push("Sin visitas registradas.");
  for (const v of e.visits) {
    lines.push(v.date + (v.who ? " - " + v.who : ""));
    if (v.notes) lines.push("  " + v.notes);
    for (const p of v.pending) lines.push("  [" + (p.done ? "x" : " ") + "] " + p.text);
  }
  lines.push("", "Los archivos cargados no están revisados ni aprobados por este sistema.");
  return lines;
}
export async function fichaPdf(e: Expediente, t: Template | undefined, counts: Record<string, number>) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setProperties({ title: "Ficha " + e.folio });
  const width = pdf.internal.pageSize.getWidth() - 96,
    bottom = pdf.internal.pageSize.getHeight() - 56;
  let y = 56;
  // El PDF básico solo admite caracteres latinos; lo demás se sustituye por «?».
  const latin = (s: string) => s.replace(/[^\u0009\u000a\u000d -~ -ÿ]/gu, "?");
  fichaLines(e, t, counts).forEach((line, i) => {
    const head = i === 0 || /^(REQUISITOS|VISITAS)/.test(line);
    pdf.setFont("helvetica", head ? "bold" : "normal");
    pdf.setFontSize(i === 0 ? 16 : head ? 12 : 10);
    for (const part of pdf.splitTextToSize(latin(line) || " ", width) as string[]) {
      if (y > bottom) {
        pdf.addPage();
        y = 56;
      }
      pdf.text(part, 48, y);
      y += i === 0 ? 22 : 14;
    }
  });
  return new Uint8Array(pdf.output("arraybuffer"));
}
export function packageEntries(
  e: Expediente,
  files: { file: RecordFile; bytes: Uint8Array }[],
  ficha: Uint8Array,
) {
  const base = safeName(e.folio + " " + e.name),
    out: { name: string; bytes: Uint8Array }[] = [{ name: base + "/00_FICHA.pdf", bytes: ficha }],
    rows = [["folio", "requisito", "archivo", "visita", "ruta"]],
    enc = new TextEncoder();
  const used = new Set<string>();
  e.requirements.forEach((q, qi) => {
    for (const { file, bytes } of files.filter((x) => x.file.requirementId === q.id)) {
      const folder = String(qi + 1).padStart(2, "0") + "_" + safeName(q.label);
      let name = safeName(file.name),
        n = 1;
      while (used.has(folder + "/" + name)) name = String(++n) + "_" + safeName(file.name);
      used.add(folder + "/" + name);
      const path = base + "/DOCUMENTOS/" + folder + "/" + name;
      out.push({ name: path, bytes });
      const visit = e.visits.find((v) => v.id === file.visitId);
      rows.push([e.folio, q.label, file.name, visit ? visit.date : "", path]);
    }
  });
  out.push({
    name: base + "/INDICE.csv",
    bytes: enc.encode("﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")),
  });
  return out;
}
