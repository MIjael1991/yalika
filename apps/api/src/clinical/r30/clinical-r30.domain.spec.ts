import {
  evaluateProfessionalPermission,
  isMembershipInDateWindow,
  normalizeCredential,
} from './clinical-r30.domain';

describe('Clinical R3.0 professional trust domain', () => {
  it('normalizes a credential without inventing data', () => {
    expect(normalizeCredential('  abc-123  ')).toBe('ABC-123');
  });

  it('accepts a membership inside its validity window', () => {
    expect(isMembershipInDateWindow(
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:59.000Z',
      new Date('2026-10-05T18:00:00.000Z'),
    )).toBe(true);
  });

  it('blocks a doctor until every trust layer is valid', () => {
    const result = evaluateProfessionalPermission({
      organizationVerificationStatus: 'VERIFIED',
      organizationActive: true,
      professionalVerificationStatus: 'PENDING',
      professionalActive: true,
      canPrescribe: false,
      membershipStatus: 'ACTIVE',
      now: new Date('2026-10-05T18:00:00.000Z'),
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('PROFESSIONAL_NOT_VERIFIED');
    expect(result.reasons).toContain('PRESCRIPTION_PERMISSION_NOT_GRANTED');
  });

  it('allows only verified doctor + establishment + active agreement', () => {
    expect(evaluateProfessionalPermission({
      organizationVerificationStatus: 'VERIFIED',
      organizationActive: true,
      professionalVerificationStatus: 'VERIFIED',
      professionalActive: true,
      canPrescribe: true,
      membershipStatus: 'ACTIVE',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-12-31T23:59:59.000Z',
      now: new Date('2026-10-05T18:00:00.000Z'),
    })).toEqual({ allowed: true, reasons: [] });
  });
});
