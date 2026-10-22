import { interpretCaptureTemporal } from './capture-temporal';

describe('capture temporal interpretation', () => {
  const now = new Date('2026-08-25T16:00:00.000Z');
  const timezone = 'America/Mexico_City';

  it('understands today and tomorrow with an assumed afternoon hour', () => {
    const result = interpretCaptureTemporal({
      message:
        'Recuérdame 15 min antes de las 4 hoy y mañana apagar el servidor',
      title: 'Recuérdame 15 min antes de las 4 hoy y mañana apagar el servidor',
      timezone,
      now: new Date('2026-08-27T18:00:00.000Z'),
    });

    expect(result.title).toBe('Apagar el servidor');
    expect(result.dueAt).toBe('2026-08-27T22:00:00.000Z');
    expect(result.recurrenceFrequency).toBe('daily');
    expect(result.recurrenceInterval).toBe(1);
    expect(result.recurrenceEndsAt).toBe('2026-08-29T05:59:00.000Z');
    expect(result.reminderMinutesBefore).toBe(15);
    expect(result.needsTemporalConfirmation).toBe(true);
    expect(result.canUseTemporalProposal).toBe(true);
    expect(result.temporalSummary).toContain('Yalika asumió horario de tarde');
    expect(result.temporalSummary).toContain('2 ocasiones: hoy y mañana');
    expect(result.temporalSummary).not.toContain('cada día');
  });

  it('removes a morning time without leaving a dangling phrase in the title', () => {
    const result = interpretCaptureTemporal({
      message:
        'Revisar el inventario del negocio mañana a las 10 de la mañana y recuérdame 30 minutos antes',
      title:
        'Revisar el inventario del negocio mañana a las 10 de la mañana y recuérdame 30 minutos antes',
      timezone,
      now,
    });

    expect(result.title).toBe('Revisar el inventario del negocio');
    expect(result.dueAt).toBe('2026-08-26T16:00:00.000Z');
    expect(result.reminderMinutesBefore).toBe(30);
  });

  it('removes a one-time weekday after using it as the due date', () => {
    const result = interpretCaptureTemporal({
      message:
        'Revisar el inventario de la papelería el lunes a las 9 de la mañana',
      title:
        'Revisar el inventario de la papelería el lunes a las 9 de la mañana',
      timezone,
      now,
    });

    expect(result.title).toBe('Revisar el inventario de la papelería');
    expect(result.dueAt).toBe('2026-08-31T15:00:00.000Z');
  });

  it('does not confuse a morning period with tomorrow', () => {
    const result = interpretCaptureTemporal({
      message: 'Llamar hoy a las 4 de la mañana',
      title: 'Llamar hoy a las 4 de la mañana',
      timezone,
      now,
    });

    expect(result.title).toBe('Llamar');
    expect(result.dueAt).toBe('2026-08-25T10:00:00.000Z');
    expect(result.recurrenceFrequency).toBeNull();
  });

  it('understands a weekly voice-style instruction', () => {
    const result = interpretCaptureTemporal({
      message: 'Recuérdame hacer ejercicio cada martes a las 6 de la tarde',
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

  it('asks before keeping a time from today that already passed', () => {
    const result = interpretCaptureTemporal({
      message: 'Apagar el servidor hoy a las 4 de la tarde',
      title: 'Apagar el servidor hoy a las 4 de la tarde',
      timezone,
      now: new Date('2026-08-27T23:00:00.000Z'),
    });

    expect(result.needsTemporalConfirmation).toBe(true);
    expect(result.temporalSummary).toContain('esa hora ya pasó');
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

describe('capture temporal: horas, duración y día del mes', () => {
  const timezone = 'America/Mexico_City';
  const now = new Date('2026-10-22T16:33:00.000Z');

  it('understands "cada 8 horas por 10 días" and starts now', () => {
    const result = interpretCaptureTemporal({
      message: 'Recuérdame cada 8 horas por 10 días pastillas',
      title: 'Recuérdame cada 8 horas por 10 días pastillas',
      timezone,
      now,
    });

    expect(result.title).toBe('Pastillas');
    expect(result.recurrenceFrequency).toBe('hourly');
    expect(result.recurrenceInterval).toBe(8);
    expect(result.dueAt).toBe('2026-10-22T16:35:00.000Z');
    expect(result.recurrenceEndsAt).toBe('2026-11-01T16:34:00.000Z');
    expect(result.needsTemporalConfirmation).toBe(true);
    expect(result.temporalSummary).toContain('cada 8 horas');
    expect(result.temporalSummary).toContain('durante 10 días');
  });

  it('puts a past day-of-month in the next month and asks to confirm', () => {
    const result = interpretCaptureTemporal({
      message: 'Recordar el día 19 a las 10 que hay junta',
      title: 'Recordar el día 19 a las 10 que hay junta',
      timezone,
      now,
    });

    expect(result.title).toBe('Junta');
    expect(result.dueAt).toBe('2026-11-19T16:00:00.000Z');
    expect(result.needsTemporalConfirmation).toBe(true);
    expect(result.temporalSummary).toContain('ya pasó este mes');
  });

  it('keeps a future day-of-month in the current month', () => {
    const result = interpretCaptureTemporal({
      message: 'Recordar el día 25 a las 10 junta con proveedores',
      title: 'Recordar el día 25 a las 10 junta con proveedores',
      timezone,
      now,
    });

    expect(result.dueAt).toBe('2026-10-25T16:00:00.000Z');
    expect(result.temporalSummary).not.toContain('ya pasó este mes');
  });
});
