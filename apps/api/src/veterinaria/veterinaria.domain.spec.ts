import {
  evaluateVeterinaryPrescriber,
  isGuardianActive,
  isVeterinaryProfession,
} from './veterinaria.domain';

const NOW = new Date('2026-10-16T12:00:00Z');
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 24 * 3600 * 1000);

const okOrg = { verificationStatus: 'VERIFIED', active: true };
const okMembership = {
  status: 'ACTIVE',
  startsAt: day(-30),
  endsAt: day(30),
  organization: okOrg,
};
const base = {
  profession: 'Médico Veterinario Zootecnista',
  professionalVerificationStatus: 'VERIFIED',
  professionalActive: true,
  canPrescribe: true,
  memberships: [okMembership],
  now: NOW,
};

describe('isVeterinaryProfession', () => {
  it('acepta profesiones veterinarias', () => {
    expect(isVeterinaryProfession('Médico Veterinario Zootecnista')).toBe(true);
    expect(isVeterinaryProfession('MVZ')).toBe(true);
    expect(isVeterinaryProfession('veterinaria')).toBe(true);
  });
  it('rechaza profesiones humanas, vacías o nulas', () => {
    expect(isVeterinaryProfession('Médico cirujano')).toBe(false);
    expect(isVeterinaryProfession('Enfermería')).toBe(false);
    expect(isVeterinaryProfession('')).toBe(false);
    expect(isVeterinaryProfession(null)).toBe(false);
    expect(isVeterinaryProfession(undefined)).toBe(false);
  });
});

describe('isGuardianActive', () => {
  it('vigente cuando está ACTIVE y dentro de la ventana', () => {
    expect(isGuardianActive({ status: 'ACTIVE' }, NOW)).toBe(true);
    expect(
      isGuardianActive({ status: 'ACTIVE', startsAt: day(-1), endsAt: day(1) }, NOW),
    ).toBe(true);
  });
  it('no vigente si está revocado, vencido, futuro o con fecha inválida', () => {
    expect(isGuardianActive({ status: 'REVOKED' }, NOW)).toBe(false);
    expect(isGuardianActive({ status: 'ACTIVE', endsAt: day(-1) }, NOW)).toBe(false);
    expect(isGuardianActive({ status: 'ACTIVE', startsAt: day(1) }, NOW)).toBe(false);
    expect(isGuardianActive({ status: 'ACTIVE', endsAt: 'no-es-fecha' }, NOW)).toBe(false);
  });
});

describe('evaluateVeterinaryPrescriber', () => {
  it('permite a un veterinario verificado con membresía vigente', () => {
    expect(evaluateVeterinaryPrescriber(base)).toEqual({ allowed: true, reasons: [] });
  });
  it('deniega profesión humana', () => {
    const r = evaluateVeterinaryPrescriber({ ...base, profession: 'Médico cirujano' });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('PROFESSION_NOT_VETERINARY');
  });
  it('deniega profesional no verificado, inactivo o sin canPrescribe', () => {
    expect(
      evaluateVeterinaryPrescriber({ ...base, professionalVerificationStatus: 'PENDING' }).reasons,
    ).toContain('PROFESSIONAL_NOT_VERIFIED');
    expect(
      evaluateVeterinaryPrescriber({ ...base, professionalActive: false }).reasons,
    ).toContain('PROFESSIONAL_INACTIVE');
    expect(
      evaluateVeterinaryPrescriber({ ...base, canPrescribe: false }).reasons,
    ).toContain('PRESCRIPTION_PERMISSION_NOT_GRANTED');
  });
  it('deniega sin membresías', () => {
    const r = evaluateVeterinaryPrescriber({ ...base, memberships: [] });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('NO_ESTABLISHMENT_MEMBERSHIP');
  });
  it('deniega organización inactiva o no verificada', () => {
    expect(
      evaluateVeterinaryPrescriber({
        ...base,
        memberships: [{ ...okMembership, organization: { ...okOrg, active: false } }],
      }).allowed,
    ).toBe(false);
    expect(
      evaluateVeterinaryPrescriber({
        ...base,
        memberships: [
          { ...okMembership, organization: { ...okOrg, verificationStatus: 'PENDING' } },
        ],
      }).allowed,
    ).toBe(false);
  });
  it('deniega membresía vencida, futura, no activa o con fecha inválida', () => {
    for (const m of [
      { ...okMembership, endsAt: day(-1) },
      { ...okMembership, startsAt: day(1) },
      { ...okMembership, status: 'ENDED' },
      { ...okMembership, endsAt: 'fecha-rota' },
    ]) {
      expect(evaluateVeterinaryPrescriber({ ...base, memberships: [m] }).allowed).toBe(false);
    }
  });
  it('basta con una membresía válida entre varias', () => {
    const r = evaluateVeterinaryPrescriber({
      ...base,
      memberships: [{ ...okMembership, endsAt: day(-1) }, okMembership],
    });
    expect(r.allowed).toBe(true);
  });
});
