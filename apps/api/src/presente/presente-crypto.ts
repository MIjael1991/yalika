import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';

import { PRESENTE_KEY_ENV } from './presente.constants';

const FILE_MAGIC = 'YPF1';
const TEXT_PREFIX = 'v1:';

/** Clave de cifrado de Presente. En producción es obligatoria; en desarrollo hay una local. */
export function presenteKey(env: NodeJS.ProcessEnv = process.env) {
  const configured = env[PRESENTE_KEY_ENV]?.trim() ?? '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  if (configured) {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length === 32) return decoded;
    if (configured.length >= 32) {
      return createHash('sha256').update(configured).digest();
    }
  }
  if (env.NODE_ENV === 'production') {
    throw new ServiceUnavailableException(
      `Falta configurar ${PRESENTE_KEY_ENV} para proteger los datos de verificación`,
    );
  }
  return createHash('sha256')
    .update('yalika-presente-solo-desarrollo')
    .digest();
}

export function encryptBuffer(value: Buffer, key = presenteKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([
    Buffer.from(FILE_MAGIC),
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}

export function decryptBuffer(value: Buffer, key = presenteKey()) {
  if (value.length < 32 || value.subarray(0, 4).toString() !== FILE_MAGIC) {
    throw new Error('El archivo protegido no es válido');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(4, 16));
  decipher.setAuthTag(value.subarray(16, 32));
  return Buffer.concat([decipher.update(value.subarray(32)), decipher.final()]);
}

export function encryptText(value: string, key = presenteKey()) {
  return (
    TEXT_PREFIX +
    encryptBuffer(Buffer.from(value, 'utf8'), key).toString('base64')
  );
}

export function decryptText(value: string, key = presenteKey()) {
  if (!value.startsWith(TEXT_PREFIX))
    throw new Error('Dato protegido no válido');
  return decryptBuffer(
    Buffer.from(value.slice(TEXT_PREFIX.length), 'base64'),
    key,
  ).toString('utf8');
}

/** Huella de la CURP: permite saber si ya se registró sin poder leerla. */
export function curpFingerprint(curp: string, key = presenteKey()) {
  return createHmac('sha256', key).update(`curp:${curp}`).digest('hex');
}
