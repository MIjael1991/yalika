import {
  canAutomaticallyDeleteSurveyIne,
  normalizeSurveyIneStorageMode,
} from './survey-storage-policy';

describe('survey storage policy', () => {
  it('uses temporary storage by default', () => {
    expect(normalizeSurveyIneStorageMode(undefined)).toBe('temporary');
    expect(normalizeSurveyIneStorageMode('owner-device')).toBe('temporary');
    expect(normalizeSurveyIneStorageMode('yaleka_cloud')).toBe('yaleka_cloud');
  });

  it('never auto-deletes an INE without confirmed backup', () => {
    expect(
      canAutomaticallyDeleteSurveyIne({
        expiresAt: new Date('2026-01-01'),
        now: new Date('2026-09-15'),
      }),
    ).toBe(false);
  });

  it('allows cleanup only after backup and expiration', () => {
    expect(
      canAutomaticallyDeleteSurveyIne({
        backupConfirmedAt: new Date('2026-09-01'),
        expiresAt: new Date('2026-09-10'),
        now: new Date('2026-09-15'),
      }),
    ).toBe(true);
    expect(
      canAutomaticallyDeleteSurveyIne({
        backupConfirmedAt: new Date('2026-09-01'),
        expiresAt: new Date('2026-10-10'),
        now: new Date('2026-09-15'),
      }),
    ).toBe(false);
  });
});
