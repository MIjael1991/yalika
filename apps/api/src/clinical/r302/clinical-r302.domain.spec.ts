import { evaluateRegistrationReadiness, registrationRequirements } from './clinical-r302.domain';

describe('Clinical R3.0.2 network domain', () => {
  it('requires consulting room evidence for pharmacy + office', () => {
    expect(registrationRequirements('PHARMACY_WITH_OFFICE')).toContain('CONSULTING_ROOM_PHOTO');
  });

  it('does not impose a 30-day age rule', () => {
    expect(registrationRequirements('DOCTOR_OFFICE')).not.toContain('MINIMUM_30_DAYS');
  });

  it('requires identity/location/evidence before review', () => {
    const result = evaluateRegistrationReadiness({
      organization: {
        organizationType: 'DOCTOR_OFFICE',
        displayName: 'Consultorio Centro',
        addressLine1: 'Av. Principal 1',
        municipality: 'Morelia',
        state: 'Michoacán',
        responsibleName: 'Dra. Ejemplo',
      },
      location: { latitude: 19.7, longitude: -101.2 },
      evidenceKinds: ['FRONT_PHOTO', 'CONSULTING_ROOM_PHOTO', 'SANITARY_NOTICE'],
    });
    expect(result).toEqual({ ready: true, missing: [] });
  });
});
