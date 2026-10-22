import {
  commissionCents,
  commissionFor,
  commissionPctSetting,
  promoCommissionPctSetting,
  normalizeReference,
  parseWalletCode,
  topupInstructions,
  walletCode,
  welcomeCreditSetting,
} from './presente-wallet.domain';

describe('saldo de Presente', () => {
  it('comisión del 7% en centavos, redondeada', () => {
    expect(commissionCents(350, 7)).toBe(2450);
    expect(commissionCents(99, 7)).toBe(693);
    expect(commissionCents(1, 7)).toBe(7);
    expect(commissionCents(500, 0)).toBe(0);
  });

  it('lee el porcentaje y el bono de la configuración, con valores seguros', () => {
    expect(commissionPctSetting({})).toBe(7);
    expect(commissionPctSetting({ PRESENTE_COMMISSION_PCT: '10' })).toBe(10);
    expect(commissionPctSetting({ PRESENTE_COMMISSION_PCT: '0' })).toBe(0);
    expect(commissionPctSetting({ PRESENTE_COMMISSION_PCT: '80' })).toBe(7);
    expect(commissionPctSetting({ PRESENTE_COMMISSION_PCT: 'x' })).toBe(7);
    expect(welcomeCreditSetting({})).toBe(100);
    expect(welcomeCreditSetting({ PRESENTE_WELCOME_CREDIT_MXN: '0' })).toBe(0);
    expect(welcomeCreditSetting({ PRESENTE_WELCOME_CREDIT_MXN: '' })).toBe(100);
    expect(promoCommissionPctSetting({})).toBe(10);
  });

  it('fundador: 10 % mientras sus comisiones no lleguen a su regalo; luego 7 %', () => {
    expect(commissionFor(10_000, 0, {})).toEqual({
      pct: 10,
      promo: true,
      giftLeftMxn: 100,
    });
    expect(commissionFor(10_000, 9_000, {}).giftLeftMxn).toBe(10);
    expect(commissionFor(10_000, 10_000, {}).pct).toBe(7);
    expect(commissionFor(0, 0, {})).toEqual({
      pct: 7,
      promo: false,
      giftLeftMxn: 0,
    });
  });

  it('referencia del trabajador: ida y vuelta', () => {
    const id = '1a2b3c4d-0000-4000-8000-000000000000';
    expect(walletCode(id)).toBe('YP1A2B3C4D');
    expect(parseWalletCode('yp 1a2b-3c4d')).toBe('1a2b3c4d');
    expect(parseWalletCode('YP123')).toBeNull();
    expect(parseWalletCode('XX1A2B3C4D')).toBeNull();
  });

  it('clave de rastreo limpia o rechazada', () => {
    expect(normalizeReference(' mbaN 0102 ')).toBe('MBAN0102');
    expect(normalizeReference('ab')).toBeNull();
    expect(normalizeReference('hola$')).toBeNull();
  });

  it('datos de la cuenta solo con una CLABE de 18 dígitos', () => {
    expect(topupInstructions({})).toBeNull();
    expect(topupInstructions({ PRESENTE_TOPUP_CLABE: '1234' })).toBeNull();
    expect(
      topupInstructions({
        PRESENTE_TOPUP_CLABE: '012 180 0000 0000 0001',
        PRESENTE_TOPUP_BANK: 'BBVA',
      }),
    ).toEqual({ clabe: '012180000000000001', bank: 'BBVA', name: 'Yalika' });
  });
});
