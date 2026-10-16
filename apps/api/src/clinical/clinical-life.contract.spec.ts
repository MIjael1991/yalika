import {
  consultationToLifeEvent,
  medicationReminderToLifeEvent,
  medicationSupplyPendingToLifeEvent,
} from './clinical-life.contract';

describe('Clinical -> Life privacy-minimized contract', () => {
  it('sends a consultation to Life without diagnosis or clinical notes', () => {
    const event = consultationToLifeEvent({
      userId: 'u1',
      consultationId: 'c1',
      startsAt: '2026-10-01T16:00:00-06:00',
    });

    expect(event.title).toBe('Consulta de salud');
    expect(JSON.stringify(event)).not.toContain('diagnosis');
    expect(JSON.stringify(event)).not.toContain('clinicalNote');
  });

  it('creates a private medication reminder without copying the drug name', () => {
    const event = medicationReminderToLifeEvent({
      userId: 'u1',
      prescriptionItemId: 'rx-item-1',
      dueAt: '2026-10-01T08:00:00-06:00',
      sequence: 1,
    });

    expect(event.sensitivity).toBe('PRIVATE');
    expect(event.title).toBe('Recordatorio de medicamento');
    expect(JSON.stringify(event)).not.toContain('Paracetamol');
  });

  it('sends only the remaining quantity for a supply pending task', () => {
    const event = medicationSupplyPendingToLifeEvent({
      userId: 'u1',
      prescriptionItemId: 'rx-item-1',
      remainingUnits: 4,
    });

    expect(event.metadata.remainingUnits).toBe(4);
    expect(event.metadata.sourceModule).toBe('clinical');
  });
});
