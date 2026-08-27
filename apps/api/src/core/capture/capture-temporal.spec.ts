import { interpretCaptureTemporal } from './capture-temporal';

describe('capture temporal interpretation', () => {
  const now = new Date('2026-08-25T16:00:00.000Z');
  const timezone = 'America/Mexico_City';

  it('understands a weekly voice-style instruction', () => {
    const result = interpretCaptureTemporal({
      message:
        'Recuérdame hacer ejercicio cada martes a las 6 de la tarde',
      title: 'Hacer ejercicio cada martes a las 6 de la tarde',
      timezone,
      now,
    });

    expect(result.title).toBe('Hacer ejercicio');
    expect(result.dueAt).toBe('2026-09-02T00:00:00.000Z');
    expect(result.recurrenceFrequency).toBe('weekly');
    expect(result.recurrenceInterval).toBe(1);
    expect(result.reminderMinutesBefore).toBe(0);
    expect(result.needsTemporalConfirmation).toBe(false);
  });

  it('chooses the next future year when the user omits it', () => {
    const result = interpretCaptureTemporal({
      message: 'Pagar seguro el 10 de agosto a las 9 am',
      title: 'Pagar seguro el 10 de agosto a las 9 am',
      timezone,
      now,
    });

    expect(result.dueAt).toBe('2027-08-10T15:00:00.000Z');
  });

  it('marks a proposed default time for confirmation', () => {
    const result = interpretCaptureTemporal({
      message: 'Comprar leche mañana',
      title: 'Comprar leche mañana',
      timezone,
      now,
    });

    expect(result.dueAt).toBe('2026-08-26T15:00:00.000Z');
    expect(result.needsTemporalConfirmation).toBe(true);
  });

  it('does not silently normalize an impossible spoken date', () => {
    const result = interpretCaptureTemporal({
      message: 'Pagar recibo el 31 de febrero a las 6 pm',
      title: 'Pagar recibo el 31 de febrero a las 6 pm',
      timezone,
      now,
    });

    expect(result.dueAt).toBeNull();
    expect(result.temporalSummary).toContain('no existe');
    expect(result.needsTemporalConfirmation).toBe(true);
  });
});
