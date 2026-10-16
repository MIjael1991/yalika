import {
  homePathForRole,
  isSurveyOnlyRole,
  modulesForRole,
} from './module-access';

describe('module access', () => {
  it('limits the reserved Encuestas role', () => {
    expect(isSurveyOnlyRole('Encuestas')).toBe(true);
    expect(modulesForRole('Encuestas')).toEqual(['surveys']);
    expect(homePathForRole('Encuestas')).toBe('/encuestas');
  });

  it('keeps existing roles fully compatible', () => {
    expect(isSurveyOnlyRole('Administrador')).toBe(false);
    expect(modulesForRole('Administrador')).toEqual(['all']);
    expect(homePathForRole('Administrador')).toBe('/');
  });
});

