import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';

import { decryptSurveyFile, encryptSurveyFile } from './survey-privacy';

const MAX_IMAGE_BYTES = 1_600_000;
const MIN_IMAGE_BYTES = 10_000;
const DATA_URL =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

function detectedImageMime(bytes: Buffer) {
  if (
    bytes.length >= 16 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.includes(Buffer.from([0xff, 0xda])) &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
    bytes.readUInt32BE(bytes.length - 12) === 0 &&
    bytes.subarray(bytes.length - 8, bytes.length - 4).toString('ascii') ===
      'IEND'
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 20 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString('ascii'))
  ) {
    const declaredSize = bytes.readUInt32LE(4) + 8;
    if (declaredSize === bytes.length) {
      return 'image/webp';
    }
  }

  return null;
}

type PreparedImage = {
  bytes: Buffer;
  mimeType: string;
};

type StoredPair = {
  id: string;
  frontObjectKey: string;
  frontMimeType: string;
  frontBytes: number;
  backObjectKey: string | null;
  backMimeType: string | null;
  backBytes: number;
};

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function encodePath(value: string) {
  return value
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

@Injectable()
export class SurveyIneStorageService {
  private credentials() {
    const accessKeyId = process.env.ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.SECRET_ACCESS_KEY?.trim();
    const endpoint = process.env.ENDPOINT?.trim();
    const bucket = process.env.BUCKET?.trim();
    const region = process.env.REGION?.trim() || 'auto';

    if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
      throw new InternalServerErrorException(
        'El almacenamiento privado de INE todavía no está conectado',
      );
    }

    return { accessKeyId, secretAccessKey, endpoint, bucket, region };
  }

  prepareImage(dataUrl: string, label: string): PreparedImage {
    const match = DATA_URL.exec(dataUrl.trim());
    if (!match) {
      throw new BadRequestException(
        `La fotografía de ${label} debe ser JPG, PNG o WEBP`,
      );
    }

    const encoded = match[2].replace(/\s/g, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < MIN_IMAGE_BYTES) {
      throw new BadRequestException(
        `La fotografía de ${label} no se pudo leer correctamente`,
      );
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `La fotografía de ${label} es demasiado pesada. Vuelve a tomarla con la cámara de Yaleka`,
      );
    }

    const actualMimeType = detectedImageMime(bytes);
    if (!actualMimeType || actualMimeType !== match[1]) {
      throw new BadRequestException(
        `La fotografía de ${label} no coincide con un archivo de imagen válido`,
      );
    }

    return { bytes, mimeType: actualMimeType };
  }

  private objectUrl(key: string) {
    const { endpoint, bucket } = this.credentials();
    const base = new URL(endpoint);
    base.hostname = `${bucket}.${base.hostname}`;
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${encodePath(key)}`;
    return base;
  }

  private async request(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Buffer,
  ) {
    const credentials = this.credentials();
    const target = this.objectUrl(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body ?? Buffer.alloc(0));
    const canonicalHeaders =
      `host:${target.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      target.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/${credentials.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    const dateKey = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, credentials.region);
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    const response = await fetch(target, {
      method,
      headers: {
        authorization:
          `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...(body ? { 'content-type': 'application/octet-stream' } : {}),
      },
      body: body ? new Uint8Array(body) : undefined,
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        'No fue posible acceder al almacenamiento privado de INE',
      );
    }

    return response;
  }

  async storePair(
    companyId: string,
    surveyId: string,
    front: PreparedImage,
    back?: PreparedImage,
  ): Promise<StoredPair> {
    const id = randomUUID();
    const prefix = `survey-ine/${companyId}/${surveyId}/${id}`;
    const frontObjectKey = `${prefix}/front.yif`;
    const backObjectKey = back ? `${prefix}/back.yif` : null;

    await this.request('PUT', frontObjectKey, encryptSurveyFile(front.bytes));
    if (back && backObjectKey) {
      try {
        await this.request('PUT', backObjectKey, encryptSurveyFile(back.bytes));
      } catch (error) {
        await this.deleteWithRetry(frontObjectKey).catch(() => undefined);
        throw error;
      }
    }

    return {
      id,
      frontObjectKey,
      frontMimeType: front.mimeType,
      frontBytes: front.bytes.length,
      backObjectKey,
      backMimeType: back?.mimeType ?? null,
      backBytes: back?.bytes.length ?? 0,
    };
  }

  async read(key: string) {
    const response = await this.request('GET', key);
    return decryptSurveyFile(Buffer.from(await response.arrayBuffer()));
  }

  async delete(key?: string | null) {
    if (!key) return;
    await this.request('DELETE', key);
  }

  private async deleteWithRetry(key?: string | null) {
    if (!key) return;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.delete(key);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * (attempt + 1)),
          );
        }
      }
    }

    throw lastError;
  }

  async deletePair(pair: {
    frontObjectKey?: string | null;
    backObjectKey?: string | null;
  }) {
    const results = await Promise.allSettled([
      this.deleteWithRetry(pair.frontObjectKey),
      this.deleteWithRetry(pair.backObjectKey),
    ]);
    if (results.some((result) => result.status === 'rejected')) {
      throw new InternalServerErrorException(
        'No fue posible eliminar completamente las fotografías',
      );
    }
  }
}
