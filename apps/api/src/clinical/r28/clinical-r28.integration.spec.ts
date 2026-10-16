import {
  consultationIntegrationEvent,
  medicationReminderIntegrationEvent,
  medicationSupplyIntegrationEvent,
} from './clinical-r28.integration';

describe('Yalika Salud R2.8B integration outbox', () => {
  it('creates deterministic consultation dedupe keys', () => {
    const input = {
      userId: 'u1',
      consultationId: 'c1',
      startsAt: '2026-10-01T10:00:00Z',
    };
    expect(consultationIntegrationEvent(input).dedupeKey)
      .toBe(consultationIntegrationEvent(input).dedupeKey);
  });

  it('keeps Life payload privacy-minimized', () => {
    const event = medicationReminderIntegrationEvent({
      userId: 'u1',
      prescriptionItemId: 'item-1',
      dueAt: '2026-10-01T08:00:00Z',
      sequence: 1,
    });
    expect(event.sensitivity).toBe('PRIVATE');
    expect(JSON.stringify(event)).not.toContain('diagnosis');
    expect(JSON.stringify(event)).not.toContain('Paracetamol');
  });

  it('represents a pending supply without copying a prescription document', () => {
    const event = medicationSupplyIntegrationEvent({
      userId: 'u1',
      prescriptionItemId: 'item-1',
      remainingUnits: 4,
    });
    expect(event.metadata.remainingUnits).toBe(4);
    expect(event.status).toBe('pending');
  });
});
