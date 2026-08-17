import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const derivedKeyLength = 64;

async function derivePassword(password: string, salt: Buffer | string) {
  return (await scryptAsync(password, salt, derivedKeyLength)) as Buffer;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await derivePassword(password, salt);

  return [
    'scrypt',
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, encodedSalt, encodedKey, ...extra] = storedHash.split('$');

  if (
    algorithm !== 'scrypt' ||
    !encodedSalt ||
    !encodedKey ||
    extra.length > 0
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(encodedKey, 'base64url');

    if (expected.length !== derivedKeyLength) {
      return false;
    }

    const actual = await derivePassword(
      password,
      Buffer.from(encodedSalt, 'base64url'),
    );

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function consumePasswordCheck(password: string) {
  await derivePassword(password, 'orion-invalid-account');
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
