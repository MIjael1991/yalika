import { createHash, randomBytes } from 'node:crypto';

export const NEW_PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_RESET_MINUTES = 20;

export function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeRecoveryKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function recoveryKeyHash(userId: string, value: string) {
  return hashOpaqueToken(`${userId}|${normalizeRecoveryKey(value)}`);
}

export function createRecoveryKey() {
  const raw = randomBytes(10).toString('hex').toUpperCase();
  const parts = raw.match(/.{1,4}/g) ?? [raw];
  return `YALEKA-${parts.join('-')}`;
}

export function validateNewPasswordPair(
  password: string,
  confirmPassword: string,
) {
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    return `La nueva contraseña debe tener al menos ${NEW_PASSWORD_MIN_LENGTH} caracteres`;
  }
  if (password.length > 128) {
    return 'La nueva contraseña es demasiado larga';
  }
  if (password !== confirmPassword) {
    return 'Las contraseñas no coinciden';
  }
  return null;
}
