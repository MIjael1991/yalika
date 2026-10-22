import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PresenteStorageService } from './presente-storage.service';

describe('fotos en desarrollo sin nube', () => {
  const saved = { ...process.env };
  let root = '';

  beforeEach(async () => {
    delete process.env.ACCESS_KEY_ID;
    delete process.env.BUCKET;
    process.env.NODE_ENV = 'test';
    root = await mkdtemp(join(tmpdir(), 'presente-'));
  });

  afterEach(async () => {
    process.env = { ...saved };
    await rm(root, { recursive: true, force: true });
  });

  it('guarda cifrado en carpeta local, lee y borra', async () => {
    const storage = new PresenteStorageService();
    storage.localRoot = root;
    const key = storage.newKey('p1', 'SELFIE');
    await storage.put(key, Buffer.from('foto'));
    const onDisk = await readFile(join(root, key));
    expect(onDisk.includes(Buffer.from('foto'))).toBe(false);
    expect((await storage.get(key)).toString()).toBe('foto');
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it('acepta las llaves de pedidos y de la casa del cliente', async () => {
    const storage = new PresenteStorageService();
    storage.localRoot = root;
    for (const key of [
      'private/presente/clients/c1/house-abc.bin',
      'private/presente/requests/r1/photo-abc.bin',
    ]) {
      await storage.put(key, Buffer.from('casa'));
      expect((await storage.get(key)).toString()).toBe('casa');
    }
  });

  it('rechaza llaves raras', async () => {
    const storage = new PresenteStorageService();
    storage.localRoot = root;
    await expect(
      storage.put('../../fuera.bin', Buffer.from('x')),
    ).rejects.toThrow();
  });

  it('en producción sin nube no guarda', async () => {
    process.env.NODE_ENV = 'production';
    process.env.YALIKA_PRESENTE_KEY = 'a'.repeat(64);
    const storage = new PresenteStorageService();
    storage.localRoot = root;
    await expect(
      storage.put(storage.newKey('p1', 'INE'), Buffer.from('x')),
    ).rejects.toThrow('no está conectado');
  });
});
