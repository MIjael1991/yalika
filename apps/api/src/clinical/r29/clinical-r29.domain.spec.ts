import {
  advanceMedicationSchedule,
  deriveMedicationSchedule,
  normalizeHealthCategories,
  proposeVisitExtraction,
} from './clinical-r29.domain';

describe('Clinical R2.9 domain safety', () => {
  it('does not invent fields when capture text is empty', () => {
    const result = proposeVisitExtraction('');
    expect(result.unreadable).toBe(true);
    expect(result.fields).toEqual({});
  });

  it('extracts only explicitly labeled visit facts', () => {
    const result = proposeVisitExtraction('Médico: Dra. Prueba\nDiagnóstico: ejemplo\nAmoxicilina 1 tableta cada 8 h por 7 días');
    expect(result.fields.doctor).toBe('Dra. Prueba');
    expect(result.fields.diagnosis).toBe('ejemplo');
    expect(result.medications[0]).toEqual(expect.objectContaining({ requiresConfirmation: true }));
  });

  it('requires an explicit interval for medication scheduling', () => {
    expect(() => deriveMedicationSchedule({ firstDoseAt: '2026-10-04T08:30:00-06:00', intervalHours: 0, durationDays: 7 })).toThrow();
  });

  it('advances every 8 hours and stops after endAt', () => {
    const schedule = deriveMedicationSchedule({ firstDoseAt: '2026-10-04T08:30:00-06:00', intervalHours: 8, durationDays: 1 });
    const next = advanceMedicationSchedule({ scheduledAt: schedule.firstDoseAt, intervalMinutes: schedule.intervalMinutes, endAt: schedule.endAt });
    expect(next?.getTime()).toBe(schedule.firstDoseAt.getTime() + 8 * 60 * 60_000);
    expect(schedule.endAt.getTime()).toBe(schedule.firstDoseAt.getTime() + 16 * 60 * 60_000);
  });

  it('accepts only known QR categories', () => {
    expect(normalizeHealthCategories(['allergies', 'prescriptions'])).toEqual(['ALLERGIES', 'PRESCRIPTIONS']);
    expect(() => normalizeHealthCategories(['passwords'])).toThrow();
  });
});
