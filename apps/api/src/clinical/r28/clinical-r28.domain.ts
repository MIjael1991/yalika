import { randomBytes, createHash } from 'node:crypto';

import { resolvePilotConsultationPrice } from '../consultation-pricing';
import {
  calculateMedicationSupplyPlan,
  projectCommercialDispense,
} from '../medication-supply';

export type ClinicalSubjectType = 'HUMAN' | 'PET' | 'LIVESTOCK';
export type ConsultationMode = 'online' | 'presential' | 'follow_up';

export function normalizeSubjectType(value: string): ClinicalSubjectType {
  const normalized = value.trim().toUpperCase();
  if (
    normalized !== 'HUMAN' &&
    normalized !== 'PET' &&
    normalized !== 'LIVESTOCK'
  ) {
    throw new Error('Tipo de sujeto clínico inválido');
  }
  return normalized;
}

export function createConsultationDraft(input: {
  clinicalProfileId: string;
  patientUserId?: string | null;
  clinicianUserId?: string | null;
  subjectType: ClinicalSubjectType;
  mode: ConsultationMode;
  scheduledAt: string;
  reason?: string | null;
  configuredPriceCents?: string | number | null;
}) {
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error('Fecha de consulta inválida');
  }

  const price = resolvePilotConsultationPrice(input.configuredPriceCents);

  return {
    clinicalProfileId: input.clinicalProfileId,
    patientUserId: input.patientUserId ?? null,
    clinicianUserId: input.clinicianUserId ?? null,
    subjectType: normalizeSubjectType(input.subjectType),
    mode: input.mode,
    status: 'scheduled' as const,
    scheduledAt,
    timezone: 'America/Mexico_City',
    reason: input.reason?.trim() || null,
    priceCents: price.amountCents,
    currency: price.currency,
    paymentStatus: 'pending' as const,
  };
}

export function createTemporaryConsultationLink(input: {
  consultationId: string;
  ttlMinutes: number;
  maxUses?: number;
  now?: Date;
}) {
  if (!Number.isInteger(input.ttlMinutes) || input.ttlMinutes < 5 || input.ttlMinutes > 10080) {
    throw new Error('La vigencia debe estar entre 5 minutos y 7 días');
  }

  const maxUses = input.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new Error('El límite de usos debe estar entre 1 y 100');
  }

  const now = input.now ?? new Date();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  return {
    token,
    record: {
      consultationId: input.consultationId,
      tokenHash,
      purpose: 'consultation_access',
      expiresAt: new Date(now.getTime() + input.ttlMinutes * 60_000),
      maxUses,
      useCount: 0,
    },
  };
}

export function hashConsultationToken(token: string) {
  if (!token || token.length < 20) {
    throw new Error('Token de consulta inválido');
  }
  return createHash('sha256').update(token).digest('hex');
}

export function canUseConsultationLink(input: {
  expiresAt: Date;
  revokedAt?: Date | null;
  maxUses: number;
  useCount: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.revokedAt) return false;
  if (input.expiresAt.getTime() <= now.getTime()) return false;
  if (input.useCount >= input.maxUses) return false;
  return true;
}

export function createRegimenDraft(input: {
  clinicalProfileId: string;
  consultationId?: string | null;
  prescriptionId?: string | null;
  prescriptionItemId?: string | null;
  instructions: string;
  doseAmount: number;
  doseUnit: string;
  administrationsPerDay: number;
  durationDays: number;
  packageUnits?: number | null;
  alreadyDispensedUnits?: number;
  firstDoseAt?: string | null;
}) {
  const supply = calculateMedicationSupplyPlan({
    doseAmountPerAdministration: input.doseAmount,
    administrationsPerDay: input.administrationsPerDay,
    durationDays: input.durationDays,
    packageUnits: input.packageUnits,
    alreadyDispensedUnits: input.alreadyDispensedUnits,
  });

  if (!input.instructions.trim()) {
    throw new Error('La indicación profesional es obligatoria');
  }
  if (!input.doseUnit.trim()) {
    throw new Error('La unidad de dosis es obligatoria');
  }

  const firstDoseAt =
    input.firstDoseAt == null ? null : new Date(input.firstDoseAt);
  if (firstDoseAt && Number.isNaN(firstDoseAt.getTime())) {
    throw new Error('Fecha de primera toma inválida');
  }

  return {
    clinicalProfileId: input.clinicalProfileId,
    consultationId: input.consultationId ?? null,
    prescriptionId: input.prescriptionId ?? null,
    prescriptionItemId: input.prescriptionItemId ?? null,
    instructions: input.instructions.trim(),
    doseAmount: input.doseAmount,
    doseUnit: input.doseUnit.trim(),
    administrationsPerDay: input.administrationsPerDay,
    durationDays: input.durationDays,
    requiredUnits: supply.requiredUnits,
    dispensedUnits: supply.alreadyDispensedUnits,
    remainingUnits: supply.remainingUnits,
    packageUnits: supply.packageUnits,
    supplyStatus: supply.status,
    firstDoseAt,
    timezone: 'America/Mexico_City',
    commercialProjection: {
      packagesToCoverRemaining: supply.packagesToCoverRemaining,
      commercialUnitsIfPurchased: supply.commercialUnitsIfPurchased,
      estimatedSurplusUnits: supply.estimatedSurplusUnits,
    },
  };
}

export function applyDispenseToRegimen(input: {
  requiredUnits: number;
  currentDispensedUnits: number;
  currentRemainingUnits: number;
  packageUnits?: number | null;
  packagesPresented?: number | null;
  looseUnitsPresented?: number | null;
}) {
  let quantityPresented = 0;

  if (input.packagesPresented != null) {
    if (!Number.isInteger(input.packagesPresented) || input.packagesPresented <= 0) {
      throw new Error('El número de cajas o presentaciones debe ser entero y positivo');
    }
    if (input.packageUnits == null || input.packageUnits <= 0) {
      throw new Error('Falta el contenido por caja o presentación');
    }
    quantityPresented += input.packagesPresented * input.packageUnits;
  }

  if (input.looseUnitsPresented != null) {
    if (!Number.isFinite(input.looseUnitsPresented) || input.looseUnitsPresented <= 0) {
      throw new Error('Las unidades sueltas deben ser positivas');
    }
    quantityPresented += input.looseUnitsPresented;
  }

  if (quantityPresented <= 0) {
    throw new Error('Indica lo que se surtió');
  }

  const projection = projectCommercialDispense({
    prescribedRemainingUnits: input.currentRemainingUnits,
    packageUnits: quantityPresented,
    packagesPurchased: 1,
  });

  const prescriptionUnitsCovered = projection.prescriptionUnitsCovered;
  const newDispensedUnits = Math.min(
    input.requiredUnits,
    input.currentDispensedUnits + prescriptionUnitsCovered,
  );
  const newRemainingUnits = Math.max(
    input.requiredUnits - newDispensedUnits,
    0,
  );

  return {
    quantityPresented,
    prescriptionUnitsCovered,
    surplusUnits: projection.surplusUnits,
    newDispensedUnits,
    newRemainingUnits,
    supplyStatus:
      newRemainingUnits <= 0
        ? ('FILLED' as const)
        : newDispensedUnits > 0
          ? ('PARTIALLY_FILLED' as const)
          : ('PENDING' as const),
  };
}
