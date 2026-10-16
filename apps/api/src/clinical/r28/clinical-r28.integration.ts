import {
  consultationToLifeEvent,
  medicationReminderToLifeEvent,
  medicationSupplyPendingToLifeEvent,
  type ClinicalLifeBridgeEvent,
} from '../clinical-life.contract';

export type PersistableClinicalIntegrationEvent = ClinicalLifeBridgeEvent & {
  dedupeKey: string;
  status: 'pending';
};

function compactKey(parts: Array<string | number>) {
  return parts.map((part) => String(part).trim()).join(':');
}

export function consultationIntegrationEvent(input: {
  userId: string;
  consultationId: string;
  startsAt: string;
}): PersistableClinicalIntegrationEvent {
  const event = consultationToLifeEvent(input);
  return {
    ...event,
    dedupeKey: compactKey([
      'clinical',
      'consultation',
      input.consultationId,
      input.startsAt,
    ]),
    status: 'pending',
  };
}

export function medicationReminderIntegrationEvent(input: {
  userId: string;
  prescriptionItemId: string;
  dueAt: string;
  sequence: number;
}): PersistableClinicalIntegrationEvent {
  const event = medicationReminderToLifeEvent(input);
  return {
    ...event,
    dedupeKey: compactKey([
      'clinical',
      'medication-reminder',
      input.prescriptionItemId,
      input.sequence,
      input.dueAt,
    ]),
    status: 'pending',
  };
}

export function medicationSupplyIntegrationEvent(input: {
  userId: string;
  prescriptionItemId: string;
  remainingUnits: number;
}): PersistableClinicalIntegrationEvent {
  const event = medicationSupplyPendingToLifeEvent(input);
  return {
    ...event,
    dedupeKey: compactKey([
      'clinical',
      'supply-pending',
      input.prescriptionItemId,
      input.remainingUnits,
    ]),
    status: 'pending',
  };
}
