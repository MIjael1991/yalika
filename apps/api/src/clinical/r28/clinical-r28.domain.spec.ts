import {
  applyDispenseToRegimen,
  canUseConsultationLink,
  createConsultationDraft,
  createRegimenDraft,
  createTemporaryConsultationLink,
  hashConsultationToken,
  normalizeSubjectType,
} from './clinical-r28.domain';

describe('Yalika Salud R2.8B domain', () => {
  it('supports human, pet and livestock subjects', () => {
    expect(normalizeSubjectType('human')).toBe('HUMAN');
    expect(normalizeSubjectType('pet')).toBe('PET');
    expect(normalizeSubjectType('livestock')).toBe('LIVESTOCK');
  });

  it('rejects an unknown clinical subject type', () => {
    expect(() => normalizeSubjectType('robot')).toThrow();
  });

  it('creates a free pilot consultation by default', () => {
    const result = createConsultationDraft({
      clinicalProfileId: 'profile-1',
      patientUserId: 'u1',
      subjectType: 'HUMAN',
      mode: 'online',
      scheduledAt: '2026-10-01T18:00:00-06:00',
    });
    expect(result.priceCents).toBe(0);
    expect(result.currency).toBe('MXN');
    expect(result.paymentStatus).toBe('pending');
  });

  it('keeps the pilot price configurable', () => {
    const result = createConsultationDraft({
      clinicalProfileId: 'profile-1',
      subjectType: 'PET',
      mode: 'follow_up',
      scheduledAt: '2026-10-01T18:00:00-06:00',
      configuredPriceCents: 1200,
    });
    expect(result.priceCents).toBe(1200);
  });

  it('creates an opaque temporary consultation token and stores only its hash', () => {
    const result = createTemporaryConsultationLink({
      consultationId: 'c1',
      ttlMinutes: 30,
      now: new Date('2026-10-01T10:00:00Z'),
    });
    expect(result.token.length).toBeGreaterThan(20);
    expect(result.record.tokenHash).toBe(hashConsultationToken(result.token));
    expect(result.record.expiresAt.toISOString()).toBe('2026-10-01T10:30:00.000Z');
  });

  it('rejects expired, revoked and exhausted links', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    expect(canUseConsultationLink({
      expiresAt: new Date('2026-10-01T10:30:00Z'),
      maxUses: 1,
      useCount: 0,
      now,
    })).toBe(true);
    expect(canUseConsultationLink({
      expiresAt: new Date('2026-10-01T09:59:00Z'),
      maxUses: 1,
      useCount: 0,
      now,
    })).toBe(false);
    expect(canUseConsultationLink({
      expiresAt: new Date('2026-10-01T10:30:00Z'),
      revokedAt: new Date('2026-10-01T09:00:00Z'),
      maxUses: 1,
      useCount: 0,
      now,
    })).toBe(false);
    expect(canUseConsultationLink({
      expiresAt: new Date('2026-10-01T10:30:00Z'),
      maxUses: 1,
      useCount: 1,
      now,
    })).toBe(false);
  });

  it('builds a regimen from the professional instruction and package size', () => {
    const result = createRegimenDraft({
      clinicalProfileId: 'profile-1',
      prescriptionId: 'rx-1',
      prescriptionItemId: 'item-1',
      instructions: '1 tableta por la mañana y 1 por la noche durante 5 días',
      doseAmount: 1,
      doseUnit: 'tableta',
      administrationsPerDay: 2,
      durationDays: 5,
      packageUnits: 6,
    });

    expect(result.requiredUnits).toBe(10);
    expect(result.remainingUnits).toBe(10);
    expect(result.commercialProjection.packagesToCoverRemaining).toBe(2);
    expect(result.commercialProjection.estimatedSurplusUnits).toBe(2);
  });

  it('does not turn commercial surplus into prescribed units', () => {
    const result = applyDispenseToRegimen({
      requiredUnits: 10,
      currentDispensedUnits: 0,
      currentRemainingUnits: 10,
      packageUnits: 6,
      packagesPresented: 2,
    });

    expect(result.quantityPresented).toBe(12);
    expect(result.prescriptionUnitsCovered).toBe(10);
    expect(result.surplusUnits).toBe(2);
    expect(result.newDispensedUnits).toBe(10);
    expect(result.newRemainingUnits).toBe(0);
    expect(result.supplyStatus).toBe('FILLED');
  });

  it('supports partial dispensing', () => {
    const result = applyDispenseToRegimen({
      requiredUnits: 10,
      currentDispensedUnits: 0,
      currentRemainingUnits: 10,
      packageUnits: 6,
      packagesPresented: 1,
    });

    expect(result.prescriptionUnitsCovered).toBe(6);
    expect(result.newRemainingUnits).toBe(4);
    expect(result.supplyStatus).toBe('PARTIALLY_FILLED');
  });

  it('supports loose units after a partial box dispense', () => {
    const result = applyDispenseToRegimen({
      requiredUnits: 10,
      currentDispensedUnits: 6,
      currentRemainingUnits: 4,
      looseUnitsPresented: 4,
    });

    expect(result.prescriptionUnitsCovered).toBe(4);
    expect(result.newRemainingUnits).toBe(0);
    expect(result.surplusUnits).toBe(0);
  });
});
