import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 8);
}

export function newOperationId(): string {
  return randomUUID();
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function clampExpiry(minutes: number, ceiling: Date): Date {
  const requested = new Date(Date.now() + minutes * 60_000);
  return requested < ceiling ? requested : ceiling;
}

export function safeDownloadName(name: string): string {
  const cleaned = name
    .replace(/[\r\n"]/g, '')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .trim();
  return cleaned || 'documento';
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function detectAllowedMime(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
