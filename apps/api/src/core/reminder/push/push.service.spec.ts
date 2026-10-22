jest.mock('../../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import type { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

import type { PrismaService } from '../../../prisma/prisma.service';
import { PushService } from './push.service';

const send = webpush.sendNotification as jest.Mock;

function build(env: Record<string, string | undefined>, prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    taskReminder: { findMany: jest.fn().mockResolvedValue([]) },
    reminderPush: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    ...prismaOverrides,
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const service = new PushService(prisma as unknown as PrismaService, config);
  service.onModuleInit();
  return { service, prisma };
}

const keys = {
  YALIKA_VAPID_PUBLIC: 'pub',
  YALIKA_VAPID_PRIVATE: 'priv',
  YALIKA_VAPID_SUBJECT: 'mailto:a@b.com',
};

describe('PushService', () => {
  beforeEach(() => {
    send.mockReset();
    (webpush.setVapidDetails as jest.Mock).mockReset();
  });

  it('stays off without VAPID keys', async () => {
    const { service, prisma } = build({});
    expect(service.getPublicKey()).toEqual({ enabled: false, publicKey: null });
    expect(await service.tick()).toBe(0);
    expect(prisma.taskReminder.findMany).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('exposes the public key and refuses unknown endpoints', async () => {
    const { service, prisma } = build(keys);
    expect(service.getPublicKey()).toEqual({ enabled: true, publicKey: 'pub' });
    const bad = await service.subscribe('u1', { endpoint: 'https://evil.com/x', p256dh: 'a', auth: 'b' });
    expect(bad.ok).toBe(false);
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    const good = await service.subscribe('u1', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'a', auth: 'b' });
    expect(good.ok).toBe(true);
    service.onModuleDestroy();
  });

  it('sends a due reminder and records it, then waits before repeating', async () => {
    const now = new Date('2026-10-22T20:00:00.000Z');
    const reminder = {
      id: 'r1', taskId: 't1', userId: 'u1', remindAt: new Date('2026-10-22T19:59:00.000Z'),
      task: { title: 'Comprar pan', category: null, space: { type: 'personal', name: 'Mi agenda' } },
    };
    const { service, prisma } = build(keys, {
      taskReminder: { findMany: jest.fn().mockResolvedValue([reminder]) },
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'a', auth: 'b' }]),
        deleteMany: jest.fn(), upsert: jest.fn(),
      },
    });
    send.mockResolvedValue({});
    expect(await service.tick(now)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1]).title).toContain('Comprar pan');
    expect(prisma.reminderPush.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ reminderId: 'r1', sentCount: 1 }) }));

    (prisma.reminderPush.findUnique as jest.Mock).mockResolvedValue({ sentCount: 1, lastSentAt: now });
    expect(await service.tick(new Date(now.getTime() + 60_000))).toBe(0);
    service.onModuleDestroy();
  });

  it('removes subscriptions the browser no longer accepts', async () => {
    const now = new Date('2026-10-22T20:00:00.000Z');
    const { service, prisma } = build(keys, {
      taskReminder: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', taskId: 't1', userId: 'u1', remindAt: new Date('2026-10-22T19:59:00.000Z'), task: { title: 'x', category: null, space: null } },
        ]),
      },
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'a', auth: 'b' }]),
        deleteMany: jest.fn().mockResolvedValue({}), upsert: jest.fn(),
      },
    });
    send.mockRejectedValue({ statusCode: 410 });
    expect(await service.tick(now)).toBe(0);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(prisma.reminderPush.upsert).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});
