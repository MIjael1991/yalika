/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- dobles de prueba */
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import {
  generateVapidKeys,
  isPushEndpoint,
  publicKeyFromPrivate,
  vapidAuthorization,
} from './presente-push.domain';
import { PresentePushService } from './presente-push.service';

const auth = (id = 'u1') => ({ user: { id } }) as any;
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('Avisos: llaves y firma', () => {
  it('la llave pública es la que pide el navegador y la firma se puede comprobar', () => {
    const keys = generateVapidKeys();
    expect(Buffer.from(keys.publicKey, 'base64url')).toHaveLength(65);
    expect(publicKeyFromPrivate(keys.privateKeyPem)).toBe(keys.publicKey);
    const header = vapidAuthorization(FCM, keys, 'mailto:avisos@yalika.mx');
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, p, sig] = token.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      {
        key: createPublicKey(createPrivateKey(keys.privateKeyPem)),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(sig, 'base64url'),
    );
    expect(ok).toBe(true);
  });

  it('solo manda a servicios de avisos conocidos (no a cualquier dirección)', () => {
    expect(isPushEndpoint(FCM)).toBe(true);
    expect(
      isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'),
    ).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://localhost:3000/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isPushEndpoint('nada')).toBe(false);
  });
});

function setup(devices: any[] = []) {
  const prisma: any = {
    presentePushConfig: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(),
    },
    presentePushSubscription: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(async () => devices.length),
      findMany: jest.fn(async () => devices),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
    presentePushMessage: {
      createMany: jest.fn(),
      findMany: jest.fn(async () => [
        {
          id: 'm1',
          title: 'Pedido nuevo',
          body: 'Llanta',
          url: '/tequio',
          tag: 't',
        },
      ]),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return { service: new PresentePushService(prisma), prisma };
}

describe('PresentePushService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('guarda el celular solo si la dirección es de un servicio de avisos', async () => {
    const { service, prisma } = setup();
    await expect(
      service.subscribe(auth(), {
        endpoint: 'https://evil.com/x',
        p256dh: 'a',
        auth: 'b',
      }),
    ).rejects.toThrow(BadRequestException);
    await service.subscribe(auth(), { endpoint: FCM, p256dh: 'a', auth: 'b' });
    expect(
      prisma.presentePushSubscription.upsert.mock.calls[0][0].create,
    ).toMatchObject({
      userId: 'u1',
      endpoint: FCM,
    });
  });

  it('avisa: guarda el mensaje y toca a cada celular; si ya no existe, lo quita', async () => {
    const { service, prisma } = setup([
      { id: 'd1', endpoint: FCM, failures: 0 },
      { id: 'd2', endpoint: `${FCM}2`, failures: 0 },
    ]);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({ ok: false, status: 410 });
    global.fetch = fetchMock as any;
    const sent = await service.notify(['u1', 'u1'], {
      title: 'Pedido nuevo',
      body: 'Se ponchó la llanta',
      url: '/tequio',
    });
    expect(sent).toBe(1);
    expect(
      prisma.presentePushMessage.createMany.mock.calls[0][0].data,
    ).toHaveLength(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(FCM);
    expect(options.headers.Authorization).toMatch(/^vapid t=/);
    expect(options.headers.TTL).toBe('3600');
    expect(prisma.presentePushSubscription.delete).toHaveBeenCalledWith({
      where: { id: 'd2' },
    });
    // Las llaves se crearon una vez y se guardaron cifradas.
    expect(prisma.presentePushConfig.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.presentePushConfig.create.mock.calls[0][0].data.privateKey,
    ).not.toContain('PRIVATE KEY');
  });

  it('si el servicio de avisos falla, no rompe el pedido', async () => {
    const { service } = setup([{ id: 'd1', endpoint: FCM, failures: 0 }]);
    global.fetch = jest.fn().mockRejectedValue(new Error('sin red')) as any;
    await expect(
      service.notify(['u1'], { title: 'x', body: 'y', url: '/tequio' }),
    ).resolves.toBe(0);
  });

  it('el celular recoge lo pendiente y queda entregado', async () => {
    const { service, prisma } = setup();
    expect(await service.inbox(auth())).toEqual([
      { title: 'Pedido nuevo', body: 'Llanta', url: '/tequio', tag: 't' },
    ]);
    expect(
      prisma.presentePushMessage.updateMany.mock.calls[0][0].where,
    ).toEqual({
      id: { in: ['m1'] },
    });
  });
});
