export type MedicationSupplyStatus =
  | 'PENDING'
  | 'PARTIALLY_FILLED'
  | 'FILLED';

export type MedicationSupplyInput = {
  doseAmountPerAdministration: number;
  administrationsPerDay: number;
  durationDays: number;
  packageUnits?: number | null;
  alreadyDispensedUnits?: number;
};

export type MedicationSupplyPlan = {
  requiredUnits: number;
  alreadyDispensedUnits: number;
  remainingUnits: number;
  status: MedicationSupplyStatus;
  packageUnits: number | null;
  packagesToCoverRemaining: number | null;
  commercialUnitsIfPurchased: number | null;
  estimatedSurplusUnits: number | null;
};

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} debe ser mayor que cero`);
  }
  return value;
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} no puede ser negativo`);
  }
  return value;
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

/**
 * Arithmetic only.
 * It never chooses a medication, dose, frequency or duration.
 * Those values must already come from a professional prescription/order.
 */
export function calculateMedicationSupplyPlan(
  input: MedicationSupplyInput,
): MedicationSupplyPlan {
  const dose = finitePositive(
    input.doseAmountPerAdministration,
    'La cantidad por toma',
  );
  const perDay = finitePositive(
    input.administrationsPerDay,
    'Las tomas por día',
  );
  const days = finitePositive(input.durationDays, 'La duración');
  const alreadyDispensed = finiteNonNegative(
    input.alreadyDispensedUnits ?? 0,
    'Lo ya surtido',
  );

  const requiredUnits = rounded(dose * perDay * days);
  const appliedDispensed = rounded(Math.min(alreadyDispensed, requiredUnits));
  const remainingUnits = rounded(Math.max(requiredUnits - appliedDispensed, 0));

  const status: MedicationSupplyStatus =
    remainingUnits <= 0
      ? 'FILLED'
      : appliedDispensed > 0
        ? 'PARTIALLY_FILLED'
        : 'PENDING';

  const packageUnits =
    input.packageUnits === undefined || input.packageUnits === null
      ? null
      : finitePositive(input.packageUnits, 'Las unidades por presentación');

  if (packageUnits === null) {
    return {
      requiredUnits,
      alreadyDispensedUnits: appliedDispensed,
      remainingUnits,
      status,
      packageUnits: null,
      packagesToCoverRemaining: null,
      commercialUnitsIfPurchased: null,
      estimatedSurplusUnits: null,
    };
  }

  const packagesToCoverRemaining =
    remainingUnits <= 0 ? 0 : Math.ceil(remainingUnits / packageUnits);
  const commercialUnitsIfPurchased = rounded(
    packagesToCoverRemaining * packageUnits,
  );
  const estimatedSurplusUnits = rounded(
    Math.max(commercialUnitsIfPurchased - remainingUnits, 0),
  );

  return {
    requiredUnits,
    alreadyDispensedUnits: appliedDispensed,
    remainingUnits,
    status,
    packageUnits,
    packagesToCoverRemaining,
    commercialUnitsIfPurchased,
    estimatedSurplusUnits,
  };
}

export type CommercialDispenseProjectionInput = {
  prescribedRemainingUnits: number;
  packageUnits: number;
  packagesPurchased: number;
};

/**
 * Separates what a commercial package contains from what the prescription needs.
 * Surplus is NOT a new dose and must never be suggested for extra use.
 */
export function projectCommercialDispense(
  input: CommercialDispenseProjectionInput,
) {
  const remaining = finiteNonNegative(
    input.prescribedRemainingUnits,
    'Lo pendiente en receta',
  );
  const packageUnits = finitePositive(
    input.packageUnits,
    'Las unidades por presentación',
  );
  const packages = finiteNonNegative(
    input.packagesPurchased,
    'El número de presentaciones',
  );

  if (!Number.isInteger(packages)) {
    throw new Error('El número de presentaciones debe ser entero');
  }

  const commercialUnits = rounded(packageUnits * packages);
  const prescriptionUnitsCovered = rounded(
    Math.min(commercialUnits, remaining),
  );
  const remainingAfterPurchase = rounded(
    Math.max(remaining - prescriptionUnitsCovered, 0),
  );
  const surplusUnits = rounded(
    Math.max(commercialUnits - prescriptionUnitsCovered, 0),
  );

  return {
    commercialUnits,
    prescriptionUnitsCovered,
    remainingAfterPurchase,
    surplusUnits,
  };
}
