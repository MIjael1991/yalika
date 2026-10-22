import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  objectUrl,
  readObjectStorageConfig,
  signRequestHeaders,
  type ObjectStorageConfig,
} from '../core/media/object-storage';
import { decryptBuffer, encryptBuffer } from './presente-crypto';

type FetchResponse = {
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};
export type PresenteFetch = (
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: Uint8Array },
) => Promise<FetchResponse>;

const sha256 = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');

/**
 * En desarrollo, sin almacenamiento en la nube configurado, las fotos se guardan cifradas en
 * apps/api/uploads/presente-privado (fuera de git). En producción la nube es obligatoria.
 *
 * Fotos de verificación: se cifran antes de salir del servidor y se guardan en una llave
 * privada (sin dirección pública). Solo el API las lee, para el operador, y se borran
 * en cuanto se decide la verificación.
 */
@Injectable()
export class PresenteStorageService {
  fetchImpl: PresenteFetch = fetch as unknown as PresenteFetch;
  clock: () => Date = () => new Date();

  /** Carpeta local (solo desarrollo, cuando no hay almacenamiento en la nube). */
  localRoot = join(process.cwd(), 'uploads', 'presente-privado');

  private useLocal() {
    return !readObjectStorageConfig() && process.env.NODE_ENV !== 'production';
  }

  private localPath(key: string) {
    if (!/^private\/presente\/(?:[\w-]+\/){1,2}[\w.-]+$/.test(key)) {
      throw new ServiceUnavailableException('Llave de archivo no válida');
    }
    return join(this.localRoot, key);
  }

  private config(): ObjectStorageConfig {
    const config = readObjectStorageConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        'El almacenamiento privado todavía no está conectado',
      );
    }
    return config;
  }

  private async send(method: string, key: string, body?: Buffer) {
    const config = this.config();
    const url = objectUrl(config, key);
    const payload = body ?? Buffer.alloc(0);
    const headers = signRequestHeaders({
      config,
      method,
      url,
      payloadHash: sha256(payload),
      now: this.clock(),
    });
    const extra: Record<string, string> = body
      ? {
          'content-type': 'application/octet-stream',
          'cache-control': 'private, no-store',
        }
      : {};
    return this.fetchImpl(url, {
      method,
      headers: { ...headers, ...extra },
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  newKey(providerId: string, kind: string) {
    return `private/presente/${providerId}/${kind.toLowerCase()}-${randomUUID()}.bin`;
  }

  async put(key: string, bytes: Buffer) {
    if (this.useLocal()) {
      const path = this.localPath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, encryptBuffer(bytes));
      return;
    }
    const response = await this.send('PUT', key, encryptBuffer(bytes));
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `No se pudo guardar la foto (almacenamiento respondió ${response.status})`,
      );
    }
  }

  async get(key: string) {
    if (this.useLocal()) {
      try {
        return decryptBuffer(await readFile(this.localPath(key)));
      } catch {
        throw new ServiceUnavailableException('No se pudo leer la foto');
      }
    }
    const response = await this.send('GET', key);
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `No se pudo leer la foto (almacenamiento respondió ${response.status})`,
      );
    }
    return decryptBuffer(Buffer.from(await response.arrayBuffer()));
  }

  async delete(key: string) {
    if (this.useLocal()) {
      await rm(this.localPath(key), { force: true });
      return;
    }
    const response = await this.send('DELETE', key);
    // 404 al borrar: ya no estaba, el resultado es el mismo.
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(
        `No se pudo borrar la foto (almacenamiento respondió ${response.status})`,
      );
    }
  }
}
