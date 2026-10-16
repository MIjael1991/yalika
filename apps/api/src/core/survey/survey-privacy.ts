import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { InternalServerErrorException } from '@nestjs/common';

function privacyKey() {
  const configured = process.env.SURVEY_PII_KEY?.trim() ?? '';
  let key: Buffer;

  if (/^[a-f\d]{64}$/i.test(configured)) {
    key = Buffer.from(configured, 'hex');
  } else {
    try {
      key = Buffer.from(configured, 'base64');
    } catch {
      key = Buffer.alloc(0);
    }
  }

  if (key.length !== 32 && configured.length >= 32) {
    key = createHash('sha256').update(configured).digest();
  }

  if (key.length !== 32) {
    throw new InternalServerErrorException(
      'Falta configurar SURVEY_PII_KEY con una clave segura de 32 bytes',
    );
  }

  return key;
}

export function encryptSurveyFile(value: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', privacyKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from('YIF1'), iv, tag, encrypted]);
}

export function decryptSurveyFile(value: Buffer) {
  if (value.length < 32 || value.subarray(0, 4).toString() !== 'YIF1') {
    throw new InternalServerErrorException('El archivo protegido no es válido');
  }

  const iv = value.subarray(4, 16);
  const tag = value.subarray(16, 32);
  const encrypted = value.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', privacyKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function encryptSurveyValue(value?: string) {
  const clean = value?.trim();

  if (!clean) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', privacyKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(clean, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptSurveyValue(value?: string | null) {
  if (!value) {
    return '';
  }

  try {
    const [iv, tag, encrypted] = value
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', privacyKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

export function hashSurveyIdentity(value?: string) {
  const clean = value?.trim().toLowerCase();

  if (!clean) {
    return null;
  }

  return createHmac('sha256', privacyKey()).update(clean).digest('hex');
}

export function hashPrivacyNotice(value: string) {
  return createHash('sha256').update(value.trim()).digest('hex');
}
