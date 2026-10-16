import {
  resolvePilotConsultationPrice,
  YALEKA_CLINICAL_PILOT_PRICE,
} from './consultation-pricing';

describe('Yalika Salud pilot consultation pricing', () => {
  it('defaults to a free consultation while the pilot remains free', () => {
    expect(YALEKA_CLINICAL_PILOT_PRICE.amountCents).toBe(0);
    expect(resolvePilotConsultationPrice().amount).toBe(0);
    expect(resolvePilotConsultationPrice().label).toBe('Gratis');
  });

  it('allows later configuration without changing the consultation model', () => {
    const price = resolvePilotConsultationPrice('1500');
    expect(price.amount).toBe(15);
    expect(price.currency).toBe('MXN');
  });

  it('supports an explicitly free consultation', () => {
    expect(resolvePilotConsultationPrice(0).amount).toBe(0);
  });

  it('rejects invalid prices', () => {
    expect(() => resolvePilotConsultationPrice('-1')).toThrow();
  });
});
