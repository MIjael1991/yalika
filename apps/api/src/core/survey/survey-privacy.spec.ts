import {
  decryptSurveyValue,
  encryptSurveyValue,
  hashPrivacyNotice,
  hashSurveyIdentity,
} from './survey-privacy';

describe('survey privacy', () => {
  const previousKey = process.env.SURVEY_PII_KEY;

  beforeAll(() => {
    process.env.SURVEY_PII_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (previousKey === undefined) {
      delete process.env.SURVEY_PII_KEY;
    } else {
      process.env.SURVEY_PII_KEY = previousKey;
    }
  });

  it('encrypts identity values and can recover them', () => {
    const encrypted = encryptSurveyValue('443 123 4567');

    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain('443 123 4567');
    expect(decryptSurveyValue(encrypted)).toBe('443 123 4567');
  });

  it('normalizes identity hashes to detect duplicates', () => {
    expect(hashSurveyIdentity(' Persona@Ejemplo.com ')).toBe(
      hashSurveyIdentity('persona@ejemplo.com'),
    );
  });

  it('creates a stable privacy notice fingerprint', () => {
    expect(hashPrivacyNotice(' Aviso de privacidad ')).toBe(
      hashPrivacyNotice('Aviso de privacidad'),
    );
  });
});
