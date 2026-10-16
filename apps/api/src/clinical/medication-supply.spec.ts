import {
  calculateMedicationSupplyPlan,
  projectCommercialDispense,
} from './medication-supply';

describe('Yalika Salud medication supply arithmetic', () => {
  it('calculates 10 tablets for one morning + one night during 5 days', () => {
    expect(
      calculateMedicationSupplyPlan({
        doseAmountPerAdministration: 1,
        administrationsPerDay: 2,
        durationDays: 5,
        packageUnits: 10,
      }),
    ).toEqual({
      requiredUnits: 10,
      alreadyDispensedUnits: 0,
      remainingUnits: 10,
      status: 'PENDING',
      packageUnits: 10,
      packagesToCoverRemaining: 1,
      commercialUnitsIfPurchased: 10,
      estimatedSurplusUnits: 0,
    });
  });

  it('uses two boxes when 10 tablets are needed and each box has 6', () => {
    const result = calculateMedicationSupplyPlan({
      doseAmountPerAdministration: 1,
      administrationsPerDay: 2,
      durationDays: 5,
      packageUnits: 6,
    });

    expect(result.requiredUnits).toBe(10);
    expect(result.packagesToCoverRemaining).toBe(2);
    expect(result.commercialUnitsIfPurchased).toBe(12);
    expect(result.estimatedSurplusUnits).toBe(2);
  });

  it('supports half-tablet instructions without rounding the clinical quantity up', () => {
    const result = calculateMedicationSupplyPlan({
      doseAmountPerAdministration: 0.5,
      administrationsPerDay: 2,
      durationDays: 5,
      packageUnits: 10,
    });

    expect(result.requiredUnits).toBe(5);
    expect(result.packagesToCoverRemaining).toBe(1);
    expect(result.estimatedSurplusUnits).toBe(5);
  });

  it('supports liquid units such as millilitres', () => {
    const result = calculateMedicationSupplyPlan({
      doseAmountPerAdministration: 5,
      administrationsPerDay: 3,
      durationDays: 5,
      packageUnits: 60,
    });

    expect(result.requiredUnits).toBe(75);
    expect(result.packagesToCoverRemaining).toBe(2);
    expect(result.commercialUnitsIfPurchased).toBe(120);
    expect(result.estimatedSurplusUnits).toBe(45);
  });

  it('marks a prescription as partially filled', () => {
    const result = calculateMedicationSupplyPlan({
      doseAmountPerAdministration: 1,
      administrationsPerDay: 2,
      durationDays: 5,
      packageUnits: 6,
      alreadyDispensedUnits: 6,
    });

    expect(result.status).toBe('PARTIALLY_FILLED');
    expect(result.remainingUnits).toBe(4);
    expect(result.packagesToCoverRemaining).toBe(1);
  });

  it('marks it filled once the prescribed amount is covered', () => {
    const result = calculateMedicationSupplyPlan({
      doseAmountPerAdministration: 1,
      administrationsPerDay: 2,
      durationDays: 5,
      packageUnits: 10,
      alreadyDispensedUnits: 10,
    });

    expect(result.status).toBe('FILLED');
    expect(result.remainingUnits).toBe(0);
    expect(result.packagesToCoverRemaining).toBe(0);
  });

  it('separates surplus package content from prescribed coverage', () => {
    expect(
      projectCommercialDispense({
        prescribedRemainingUnits: 10,
        packageUnits: 6,
        packagesPurchased: 2,
      }),
    ).toEqual({
      commercialUnits: 12,
      prescriptionUnitsCovered: 10,
      remainingAfterPurchase: 0,
      surplusUnits: 2,
    });
  });

  it('rejects invalid arithmetic inputs instead of guessing', () => {
    expect(() =>
      calculateMedicationSupplyPlan({
        doseAmountPerAdministration: 0,
        administrationsPerDay: 2,
        durationDays: 5,
      }),
    ).toThrow('mayor que cero');
  });
});
