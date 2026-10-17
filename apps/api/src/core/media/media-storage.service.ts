import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ObjectStorageClient,
  readObjectStorageConfig,
  type FetchLike,
} from './object-storage';

/** Nombres que genera Yalika: UUID + extensión. Cualquier otra cosa se rechaza. */
export const IMAGE_FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const SIGNED_LINK_SECONDS = 3600;

export type ImageLocation =
  | { kind: 'local'; path: string }
  | { kind: 'redirect'; url: string; cacheControl: string };

/**
 * Dónde viven las fotos:
 * - Con ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT y BUCKET (Cloudflare R2): se guardan en R2
 *   y el navegador las lee directo de R2; la API ya no sirve los bytes.
 * - Sin esas variables (desarrollo): se guardan en la carpeta uploads/images.
 * Las fotos viejas que sigan en la carpeta del servidor se siguen sirviendo desde ahí.
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  /** Se pueden cambiar en pruebas. */
  directory = join(process.cwd(), 'uploads', 'images');
  fetchImpl?: FetchLike;
  clock?: () => Date;
  env: Record<string, string | undefined> = process.env;

  private client() {
    const config = readObjectStorageConfig(this.env);
    return config
      ? new ObjectStorageClient(config, this.fetchImpl, this.clock)
      : null;
  }

  private key(filename: string) {
    return `images/${filename}`;
  }

  async save(filename: string, bytes: Buffer, mimeType: string) {
    const client = this.client();

    if (client) {
      // Si la nube falla, se avisa: guardar en el disco del servidor perdería la foto al reiniciar.
      await client.put(this.key(filename), bytes, mimeType);
      return;
    }

    mkdirSync(this.directory, { recursive: true });
    writeFileSync(join(this.directory, filename), bytes);
  }

  /** Dónde está la foto ahora: archivo local viejo, o dirección directa de R2. */
  locate(filename: string): ImageLocation | null {
    const localPath = join(this.directory, filename);

    if (existsSync(localPath)) {
      return { kind: 'local', path: localPath };
    }

    const client = this.client();
    if (!client) return null;

    // Si el negocio publicó un dominio propio para las fotos, esa dirección no caduca.
    const publicBase = this.env.MEDIA_PUBLIC_URL?.trim().replace(/\/+$/, '');
    if (publicBase) {
      return {
        kind: 'redirect',
        url: `${publicBase}/${this.key(filename)}`,
        cacheControl: 'public, max-age=86400',
      };
    }

    return {
      kind: 'redirect',
      url: client.presignedGet(this.key(filename), SIGNED_LINK_SECONDS),
      // La dirección dura una hora: se guarda en el navegador un poco menos.
      cacheControl: `private, max-age=${SIGNED_LINK_SECONDS / 2}`,
    };
  }

  async remove(filename: string) {
    const client = this.client();
    if (!client) return;

    try {
      await client.delete(this.key(filename));
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar la foto ${filename}: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }
}
