import { buildHealthCompletion } from './clinical-r303.domain';

describe('Clinical R3.0.3 patient home domain', () => {
  it('calcula progreso sin convertirlo en dato clínico', () => {
    expect(buildHealthCompletion({
      bloodType: true,
      emergencyContact: true,
      allergies: false,
      chronicConditions: true,
      currentMedications: false,
      procedures: false,
    })).toEqual({
      completed: 3,
      total: 6,
      percent: 50,
      missing: [
        { key: 'allergies', label: 'Alergias' },
        { key: 'currentMedications', label: 'Medicamentos actuales' },
        { key: 'procedures', label: 'Cirugías o procedimientos' },
      ],
    });
  });
});
