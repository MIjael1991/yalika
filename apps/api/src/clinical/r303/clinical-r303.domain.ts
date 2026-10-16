export function buildHealthCompletion(input: {
  bloodType: boolean;
  emergencyContact: boolean;
  allergies: boolean;
  chronicConditions: boolean;
  currentMedications: boolean;
  procedures: boolean;
}) {
  const checks = [
    ['bloodType', 'Tipo de sangre', input.bloodType],
    ['emergencyContact', 'Contacto de emergencia', input.emergencyContact],
    ['allergies', 'Alergias', input.allergies],
    ['chronicConditions', 'Padecimientos crónicos', input.chronicConditions],
    ['currentMedications', 'Medicamentos actuales', input.currentMedications],
    ['procedures', 'Cirugías o procedimientos', input.procedures],
  ] as const;
  const completed = checks.filter(([, , done]) => done).length;
  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    missing: checks.filter(([, , done]) => !done).map(([key, label]) => ({ key, label })),
  };
}
