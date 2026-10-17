import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MediaController, matchesImageSignature } from './media.controller';
import { IMAGE_FILE_NAME, MediaStorageService } from './media-storage.service';
import {
  ObjectStorageClient,
  objectUrl,
  presignGetUrl,
  readObjectStorageConfig,
  signRequestHeaders,
  type ObjectStorageConfig,
} from './object-storage';

// Ejemplos oficiales de AWS Signature V4 (documentación de S3).
const awsExample: ObjectStorageConfig = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  endpoint: 'https://examplebucket.s3.amazonaws.com',
  bucket: 'examplebucket',
  region: 'us-east-1',
};
const awsNow = new Date('2013-05-24T00:00:00Z');
const emptyHash = createHash('sha256').update('').digest('hex');

const r2: Record<string, string> = {
  ACCESS_KEY_ID: 'key-id',
  SECRET_ACCESS_KEY: 'secret',
  ENDPOINT: 'https://cuenta123.r2.cloudflarestorage.com',
  BUCKET: 'yalika-fotos',
  REGION: 'auto',
};

const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
  Buffer.from('IHDR'),
  Buffer.alloc(40),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

const UUID = '3f2c7c1e-1b2a-4c5d-8e9f-0a1b2c3d4e5f';

describe('Firma de almacenamiento (ejemplos oficiales de AWS)', () => {
  it('dirección temporal firmada: coincide con el ejemplo de AWS', () => {
    const url = presignGetUrl(
      awsExample,
      'test.txt',
      86400,
      awsNow,
      new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    );

    expect(url).toContain(
      'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
    expect(url).toContain('X-Amz-Expires=86400');
    expect(url).toContain('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request');
  });

  it('firma con encabezados: coincide con el ejemplo de AWS (GET con Range)', () => {
    const headers = signRequestHeaders({
      config: awsExample,
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      payloadHash: emptyHash,
      now: awsNow,
      extraHeaders: { range: 'bytes=0-9' },
    });

    expect(headers.authorization).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date');
    expect(headers.authorization).toContain(
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });
});

describe('Configuración de R2', () => {
  it('sin alguna de las variables no se usa la nube', () => {
    expect(readObjectStorageConfig({})).toBeNull();
    for (const missing of ['ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'ENDPOINT', 'BUCKET']) {
      expect(readObjectStorageConfig({ ...r2, [missing]: undefined })).toBeNull();
      expect(readObjectStorageConfig({ ...r2, [missing]: '  ' })).toBeNull();
    }
  });

  it('un ENDPOINT inválido no se usa', () => {
    expect(readObjectStorageConfig({ ...r2, ENDPOINT: 'no es una dirección' })).toBeNull();
  });

  it('REGION por omisión es auto', () => {
    expect(readObjectStorageConfig({ ...r2, REGION: undefined })?.region).toBe('auto');
    expect(readObjectStorageConfig(r2)?.bucket).toBe('yalika-fotos');
  });

  it('dirección del objeto en estilo ruta', () => {
    const config = readObjectStorageConfig(r2) as ObjectStorageConfig;
    expect(objectUrl(config, `images/${UUID}.png`).toString()).toBe(
      `https://cuenta123.r2.cloudflarestorage.com/yalika-fotos/images/${UUID}.png`,
    );
  });
});

describe('ObjectStorageClient', () => {
  const config = readObjectStorageConfig(r2) as ObjectStorageConfig;

  it('guarda con tipo, caché y firma; nunca manda la llave secreta', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const client = new ObjectStorageClient(config, fetchImpl, () => awsNow);

    await client.put('images/a.png', PNG, 'image/png');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://cuenta123.r2.cloudflarestorage.com/yalika-fotos/images/a.png');
    expect(init.method).toBe('PUT');
    expect(init.headers['content-type']).toBe('image/png');
    expect(init.headers['cache-control']).toContain('immutable');
    expect(init.headers['x-amz-content-sha256']).toBe(createHash('sha256').update(PNG).digest('hex'));
    expect(init.headers.authorization).toContain('Credential=key-id/20130524/auto/s3/aws4_request');
    expect(JSON.stringify(init.headers)).not.toContain('secret');
    expect(Buffer.from(init.body).equals(PNG)).toBe(true);
  });

  it('si R2 rechaza el guardado, falla', async () => {
    const client = new ObjectStorageClient(config, jest.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(client.put('images/a.png', PNG, 'image/png')).rejects.toThrow('403');
  });

  it('borrar una foto que ya no está no es error, pero un 500 sí', async () => {
    await expect(
      new ObjectStorageClient(config, jest.fn().mockResolvedValue({ ok: false, status: 404 })).delete('images/a.png'),
    ).resolves.toBeUndefined();
    await expect(
      new ObjectStorageClient(config, jest.fn().mockResolvedValue({ ok: false, status: 500 })).delete('images/a.png'),
    ).rejects.toThrow('500');
  });

  it('la dirección firmada apunta al bucket y caduca', () => {
    const client = new ObjectStorageClient(config, jest.fn(), () => awsNow);
    const url = new URL(client.presignedGet('images/a.png', 600));
    expect(url.host).toBe('cuenta123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/yalika-fotos/images/a.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain('secret');
  });
});

describe('MediaStorageService', () => {
  let dir: string;
  let storage: MediaStorageService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yalika-media-'));
    storage = new MediaStorageService();
    storage.directory = dir;
    storage.env = {};
    storage.clock = () => awsNow;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sin variables de R2 (desarrollo) guarda en la carpeta local', async () => {
    await storage.save(`${UUID}.png`, PNG, 'image/png');

    expect(readFileSync(join(dir, `${UUID}.png`)).equals(PNG)).toBe(true);
    expect(storage.locate(`${UUID}.png`)).toEqual({ kind: 'local', path: join(dir, `${UUID}.png`) });
    expect(storage.locate(`${UUID.replace('3f', '4f')}.png`)).toBeNull();
  });

  it('con R2 guarda en la nube y NO escribe en el disco', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    storage.env = r2;
    storage.fetchImpl = fetchImpl;

    await storage.save(`${UUID}.jpg`, JPEG, 'image/jpeg');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(`/yalika-fotos/images/${UUID}.jpg`);
    expect(existsSync(join(dir, `${UUID}.jpg`))).toBe(false);
  });

  it('si R2 falla no cae al disco (se perdería al reiniciar)', async () => {
    storage.env = r2;
    storage.fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(storage.save(`${UUID}.jpg`, JPEG, 'image/jpeg')).rejects.toThrow();
    expect(existsSync(join(dir, `${UUID}.jpg`))).toBe(false);
  });

  it('con R2 la foto se lee directo de R2 con dirección firmada', () => {
    storage.env = r2;

    const location = storage.locate(`${UUID}.webp`);

    expect(location?.kind).toBe('redirect');
    if (location?.kind !== 'redirect') return;
    expect(location.url).toContain(`https://cuenta123.r2.cloudflarestorage.com/yalika-fotos/images/${UUID}.webp?`);
    expect(location.url).toContain('X-Amz-Signature=');
    expect(location.cacheControl).toBe('private, max-age=1800');
  });

  it('con dominio público propio usa una dirección que no caduca', () => {
    storage.env = { ...r2, MEDIA_PUBLIC_URL: 'https://fotos.midominio.com/' };

    const location = storage.locate(`${UUID}.png`);

    expect(location).toEqual({
      kind: 'redirect',
      url: `https://fotos.midominio.com/images/${UUID}.png`,
      cacheControl: 'public, max-age=86400',
    });
  });

  it('una foto vieja que sigue en el disco del servidor se sigue sirviendo', () => {
    writeFileSync(join(dir, `${UUID}.png`), PNG);
    storage.env = r2;

    expect(storage.locate(`${UUID}.png`)).toEqual({ kind: 'local', path: join(dir, `${UUID}.png`) });
  });

  it('borrar no revienta aunque R2 falle', async () => {
    storage.env = r2;
    storage.fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(storage.remove(`${UUID}.png`)).resolves.toBeUndefined();
  });
});

describe('MediaController', () => {
  let dir: string;
  let storage: MediaStorageService;
  let controller: MediaController;

  const response = () => ({
    setHeader: jest.fn(),
    redirect: jest.fn(),
    sendFile: jest.fn(),
  });
  const upload = (buffer: Buffer, mimetype: string) => ({
    buffer,
    mimetype,
    originalname: 'foto.png',
    size: buffer.length,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yalika-media-'));
    storage = new MediaStorageService();
    storage.directory = dir;
    storage.env = {};
    controller = new MediaController(storage);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('subir una foto devuelve la misma dirección de siempre, con nombre seguro', async () => {
    const result = await controller.uploadImage(upload(PNG, 'image/png'));

    expect(result.url).toBe(`/api/yalika/media/image/${result.filename}`);
    expect(result.filename).toMatch(IMAGE_FILE_NAME);
    expect(result.filename.endsWith('.png')).toBe(true);
    expect(existsSync(join(dir, result.filename))).toBe(true);
  });

  it('con R2 la foto sube a R2 y la dirección no cambia', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    storage.env = r2;
    storage.fetchImpl = fetchImpl;

    const result = await controller.uploadImage(upload(JPEG, 'image/jpeg'));

    expect(result.url).toBe(`/api/yalika/media/image/${result.filename}`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dir, result.filename))).toBe(false);
  });

  it('rechaza un archivo cuyo contenido no es la imagen que dice ser, sin guardar nada', async () => {
    const fetchImpl = jest.fn();
    storage.env = r2;
    storage.fetchImpl = fetchImpl;

    await expect(controller.uploadImage(upload(Buffer.from('<script>alert(1)</script>'), 'image/png'))).rejects.toThrow(BadRequestException);
    await expect(controller.uploadImage(upload(PNG, 'image/jpeg'))).rejects.toThrow(BadRequestException);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sin archivo pide seleccionar una imagen', async () => {
    await expect(controller.uploadImage(undefined)).rejects.toThrow('Selecciona una imagen');
  });

  it('si R2 falla, responde un error claro y no inventa una foto', async () => {
    storage.env = r2;
    storage.fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(controller.uploadImage(upload(JPEG, 'image/jpeg'))).rejects.toThrow(InternalServerErrorException);
  });

  it('ver una foto en R2 manda al navegador directo a R2', () => {
    storage.env = r2;
    const res = response();

    controller.findImage(`${UUID}.png`, res as never);

    expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining('r2.cloudflarestorage.com'));
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=1800');
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('una foto local vieja se sirve desde el disco', () => {
    writeFileSync(join(dir, `${UUID}.png`), PNG);
    const res = response();

    controller.findImage(`${UUID}.png`, res as never);

    expect(res.sendFile).toHaveBeenCalledWith(join(dir, `${UUID}.png`));
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('una foto que no existe da 404', () => {
    expect(() => controller.findImage(`${UUID}.png`, response() as never)).toThrow(NotFoundException);
  });

  it('nombres raros no llegan al disco ni a R2', () => {
    storage.env = r2;
    for (const name of ['../secreto.png', '..%2Fsecreto', 'a.png', `${UUID}.svg`, `${UUID}.png/../x`, `${UUID}.PNG`, '']) {
      expect(() => controller.findImage(name, response() as never)).toThrow(BadRequestException);
    }
  });
});

describe('Firma de archivos de imagen', () => {
  it('acepta las cuatro firmas y rechaza lo demás', () => {
    expect(matchesImageSignature(PNG, 'image/png')).toBe(true);
    expect(matchesImageSignature(JPEG, 'image/jpeg')).toBe(true);
    expect(matchesImageSignature(Buffer.from('GIF89a' + '\0'.repeat(10)), 'image/gif')).toBe(true);
    expect(matchesImageSignature(Buffer.from('RIFF\0\0\0\0WEBPVP8 ' + '\0'.repeat(8)), 'image/webp')).toBe(true);
    expect(matchesImageSignature(PNG, 'image/gif')).toBe(false);
    expect(matchesImageSignature(Buffer.from('hola'), 'image/svg+xml')).toBe(false);
  });
});
