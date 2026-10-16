import {
  createRecoveryKey,
  hashOpaqueToken,
  normalizeRecoveryKey,
  recoveryKeyHash,
  validateNewPasswordPair,
} from './account-security.helpers';

describe('account security helpers', () => {
  it('genera claves de recuperación Yaleka difíciles de adivinar', () => {
    const a = createRecoveryKey();
    const b = createRecoveryKey();
    expect(a).toMatch(/^YALEKA-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}$/);
    expect(a).not.toBe(b);
  });

  it('normaliza claves sin depender de guiones o minúsculas', () => {
    expect(normalizeRecoveryKey(' yaleka-abcd-1234 ')).toBe('YALEKAABCD1234');
    expect(recoveryKeyHash('u1', 'YALEKA-ABCD-1234')).toBe(
      recoveryKeyHash('u1', 'yaleka abcd 1234'),
    );
  });

  it('valida coincidencia y longitud de contraseña nueva', () => {
    expect(validateNewPasswordPair('123456789', '123456789')).toContain('10');
    expect(validateNewPasswordPair('abcdefghij', 'abcdefghijk')).toContain(
      'coinciden',
    );
    expect(validateNewPasswordPair('abcdefghij', 'abcdefghij')).toBeNull();
  });

  it('hash de token no conserva el valor original', () => {
    const token = 'token-super-secreto';
    expect(hashOpaqueToken(token)).not.toContain(token);
    expect(hashOpaqueToken(token)).toHaveLength(64);
  });
});
