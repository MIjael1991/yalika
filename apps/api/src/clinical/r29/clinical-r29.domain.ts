export const HEALTH_SHARE_CATEGORIES = new Set([
  'ESSENTIAL',
  'ALLERGIES',
  'CURRENT_MEDICATIONS',
  'PRESCRIPTIONS',
  'STUDIES',
  'RECENT_CONSULTATIONS',
  'PROCEDURES',
  'FULL_HISTORY',
]);

export function normalizeHealthCategories(values: string[]) {
  const unique = [...new Set(values.map((value) => value.trim().toUpperCase()))];
  if (!unique.length) throw new Error('Selecciona al menos una categoría');
  for (const value of unique) {
    if (!HEALTH_SHARE_CATEGORIES.has(value)) {
      throw new Error(`Categoría de Salud no permitida: ${value}`);
    }
  }
  return unique;
}

export function proposeVisitExtraction(sourceText?: string | null) {
  const text = sourceText?.trim() ?? '';
  if (!text) {
    return {
      fields: {},
      medications: [],
      unreadable: true,
      message: 'No hay texto legible. Confirma manualmente los datos de la consulta.',
    };
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fields: Record<string, string> = {};
  const labels: Array<[string, RegExp]> = [
    ['doctor', /^(?:m[eé]dico|doctor|dra?\.?)[\s:.-]+(.+)$/i],
    ['specialty', /^(?:especialidad)[\s:.-]+(.+)$/i],
    ['institution', /^(?:cl[ií]nica|hospital|instituci[oó]n)[\s:.-]+(.+)$/i],
    ['diagnosis', /^(?:diagn[oó]stico)[\s:.-]+(.+)$/i],
    ['recommendations', /^(?:recomendaciones?|indicaciones?)[\s:.-]+(.+)$/i],
    ['followUp', /^(?:revisi[oó]n|pr[oó]xima consulta|seguimiento)[\s:.-]+(.+)$/i],
  ];

  for (const line of lines) {
    for (const [key, regex] of labels) {
      const match = line.match(regex);
      if (match?.[1] && !fields[key]) fields[key] = match[1].trim();
    }
  }

  const medications = lines
    .filter((line) => /(?:cada\s+\d+\s*h|\d+\s*(?:tableta|c[aá]psula|ml)|por\s+\d+\s+d[ií]as)/i.test(line))
    .slice(0, 20)
    .map((line) => ({ raw: line, requiresConfirmation: true }));

  return {
    fields,
    medications,
    unreadable: false,
    message: 'Esto es lo que Yalika pudo organizar del texto. Confirma antes de guardarlo como hecho clínico.',
  };
}

export function deriveMedicationSchedule(input: {
  firstDoseAt: string | Date;
  intervalHours: number;
  endAt?: string | Date | null;
  durationDays?: number | null;
}) {
  if (!Number.isInteger(input.intervalHours) || input.intervalHours < 1 || input.intervalHours > 168) {
    throw new Error('El intervalo debe confirmarse en horas y estar entre 1 y 168');
  }
  const firstDoseAt = new Date(input.firstDoseAt);
  if (Number.isNaN(firstDoseAt.getTime())) throw new Error('Primera dosis inválida');

  let endAt: Date;
  if (input.endAt) {
    endAt = new Date(input.endAt);
  } else if (input.durationDays && input.durationDays > 0) {
    const intervalMs = input.intervalHours * 60 * 60_000;
    const treatmentMs = input.durationDays * 24 * 60 * 60_000;
    endAt = new Date(firstDoseAt.getTime() + Math.max(treatmentMs - intervalMs, 0));
  } else {
    throw new Error('Confirma la fecha final o la duración del tratamiento');
  }
  if (Number.isNaN(endAt.getTime()) || endAt < firstDoseAt) {
    throw new Error('La fecha final del tratamiento es inválida');
  }

  return {
    firstDoseAt,
    intervalMinutes: input.intervalHours * 60,
    endAt,
    nextDoseAt: firstDoseAt,
  };
}

export function advanceMedicationSchedule(input: {
  scheduledAt: Date;
  intervalMinutes: number;
  endAt: Date;
}) {
  const candidate = new Date(input.scheduledAt.getTime() + input.intervalMinutes * 60_000);
  return candidate <= input.endAt ? candidate : null;
}

export function buildSimpleDoctorSummaryLines(input: {
  generatedAt: Date;
  allergies: Array<{ substance: string; allergyType: string; reaction: string | null; severity: string }>;
  restrictions: Array<{ itemName: string; restrictionType: string; reactionOrReason: string | null }>;
  medications: Array<{ name: string; instructions: string; status: string; taken: number; omitted: number }>;
  consultations: Array<{ title: string; occurredAt: Date; status: string }>;
  procedures: Array<{ procedureName: string; occurredAt: Date; hospitalName: string | null }>;
  documents: Array<{ title: string; createdAt: Date }>;
}) {
  const lines: string[] = [
    'YALIKA SALUD - RESUMEN PARA EL MEDICO',
    `Generado: ${input.generatedAt.toISOString()}`,
    '',
    'ALERGIAS',
    ...(!input.allergies.length ? ['Sin alergias registradas.'] : input.allergies.map((a) => `- ${a.substance} | ${a.allergyType} | ${a.severity}${a.reaction ? ` | ${a.reaction}` : ''}`)),
    '',
    'RESTRICCIONES',
    ...(!input.restrictions.length ? ['Sin restricciones registradas.'] : input.restrictions.map((r) => `- ${r.itemName} | ${r.restrictionType}${r.reactionOrReason ? ` | ${r.reactionOrReason}` : ''}`)),
    '',
    'MEDICAMENTOS / SEGUIMIENTO',
    ...(!input.medications.length ? ['Sin tratamientos activos registrados.'] : input.medications.map((m) => `- ${m.name}: ${m.instructions} | ${m.status} | tomadas ${m.taken} | omitidas ${m.omitted}`)),
    '',
    'CONSULTAS RECIENTES',
    ...input.consultations.map((c) => `- ${c.occurredAt.toISOString().slice(0, 10)} | ${c.title} | ${c.status}`),
    '',
    'PROCEDIMIENTOS',
    ...input.procedures.map((p) => `- ${p.occurredAt.toISOString().slice(0, 10)} | ${p.procedureName}${p.hospitalName ? ` | ${p.hospitalName}` : ''}`),
    '',
    'DOCUMENTOS NUEVOS',
    ...input.documents.map((d) => `- ${d.createdAt.toISOString().slice(0, 10)} | ${d.title}`),
    '',
    'Este resumen se basa solamente en información registrada en Yalika. No agrega diagnósticos nuevos.',
  ];
  return lines;
}
