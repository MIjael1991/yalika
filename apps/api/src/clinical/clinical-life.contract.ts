export type ClinicalLifeEventType =
  | 'clinical.consultation.scheduled'
  | 'clinical.medication.reminder.requested'
  | 'clinical.medication.supply.pending';

export type ClinicalLifeBridgeEvent = {
  type: ClinicalLifeEventType;
  userId: string;
  sourceId: string;
  dueAt?: string;
  title: string;
  sensitivity: 'PRIVATE';
  metadata: Record<string, string | number | boolean | null>;
};

/**
 * Life receives only the minimum it needs for agenda/reminders.
 * Diagnosis, clinical notes, prescription documents and medication names
 * stay inside the clinical module unless an explicit UI permission is added later.
 */
export function consultationToLifeEvent(input: {
  userId: string;
  consultationId: string;
  startsAt: string;
}): ClinicalLifeBridgeEvent {
  return {
    type: 'clinical.consultation.scheduled',
    userId: input.userId,
    sourceId: input.consultationId,
    dueAt: input.startsAt,
    title: 'Consulta de salud',
    sensitivity: 'PRIVATE',
    metadata: {
      sourceModule: 'clinical',
      sourceType: 'consultation',
    },
  };
}

export function medicationReminderToLifeEvent(input: {
  userId: string;
  prescriptionItemId: string;
  dueAt: string;
  sequence: number;
}): ClinicalLifeBridgeEvent {
  return {
    type: 'clinical.medication.reminder.requested',
    userId: input.userId,
    sourceId: input.prescriptionItemId,
    dueAt: input.dueAt,
    title: 'Recordatorio de medicamento',
    sensitivity: 'PRIVATE',
    metadata: {
      sourceModule: 'clinical',
      sourceType: 'prescription_item',
      sequence: input.sequence,
    },
  };
}

export function medicationSupplyPendingToLifeEvent(input: {
  userId: string;
  prescriptionItemId: string;
  remainingUnits: number;
}): ClinicalLifeBridgeEvent {
  return {
    type: 'clinical.medication.supply.pending',
    userId: input.userId,
    sourceId: input.prescriptionItemId,
    title: 'Medicamento pendiente por surtir',
    sensitivity: 'PRIVATE',
    metadata: {
      sourceModule: 'clinical',
      sourceType: 'prescription_item',
      remainingUnits: input.remainingUnits,
    },
  };
}
