import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

@Injectable()
export class ClinicalStorageService {
  private get root(): string {
    const configured = process.env.CLINICAL_STORAGE_DIR?.trim();
    if (configured) return path.resolve(configured);

    if (
      process.env.NODE_ENV === 'production' &&
      process.env.CLINICAL_ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'El almacenamiento clínico productivo no está configurado',
      );
    }

    return path.resolve(process.cwd(), '.yalika-clinical-dev');
  }

  async saveOriginal(
    profileId: string,
    documentId: string,
    content: Buffer,
  ): Promise<string> {
    const relative = path.join(profileId, `${documentId}.bin`);
    const absolute = path.join(this.root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, { flag: 'wx', mode: 0o600 });
    return relative.replaceAll('\\', '/');
  }

  async read(storageKey: string): Promise<Buffer> {
    const absolute = path.resolve(this.root, storageKey);
    const root = path.resolve(this.root) + path.sep;
    if (!absolute.startsWith(root)) {
      throw new ServiceUnavailableException('Referencia de archivo inválida');
    }
    return readFile(absolute);
  }

  async remove(storageKey: string): Promise<void> {
    const absolute = path.resolve(this.root, storageKey);
    const root = path.resolve(this.root) + path.sep;
    if (!absolute.startsWith(root)) return;
    await rm(absolute, { force: true });
  }
}
