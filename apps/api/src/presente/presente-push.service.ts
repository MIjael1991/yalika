import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { decryptText, encryptText } from './presente-crypto';
import {
  generateVapidKeys,
  isPushEndpoint,
  publicKeyFromPrivate,
  vapidAuthorization,
  type VapidKeys,
} from './presente-push.domain';

const CONFIG_ID = 'vapid';
const KEEP_MS = 2 * 86_400_000;
const MAX_FAILURES = 3;
const INBOX_LIMIT = 5;

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

/**
 * Avisos al celular aunque Yalika esté cerrada (pedido nuevo cerca, presupuesto, te eligieron,
 * va en camino, mensajes, cancelaciones).
 * - Las llaves salen de PRESENTE_VAPID_PUBLIC_KEY / PRESENTE_VAPID_PRIVATE_KEY; si no están,
 *   Yalika crea las suyas una vez y las guarda cifradas.
 * - El aviso viaja vacío; el celular pide aquí lo pendiente (inbox).
 * - Si algo falla, el trabajo sigue normal: solo no llega el aviso.
 */
@Injectable()
export class PresentePushService {
  private readonly logger = new Logger('TequioAvisos');
  private keys: Promise<VapidKeys> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private subject() {
    return (
      process.env.PRESENTE_VAPID_SUBJECT?.trim() || 'mailto:avisos@yalika.mx'
    );
  }

  private loadKeys() {
    this.keys ??= this.readKeys().catch((error: unknown) => {
      this.keys = null;
      throw error;
    });
    return this.keys;
  }

  private async readKeys(): Promise<VapidKeys> {
    const envPrivate = process.env.PRESENTE_VAPID_PRIVATE_KEY?.trim();
    if (envPrivate) {
      const privateKeyPem = envPrivate.replace(/\\n/g, '\n');
      return { privateKeyPem, publicKey: publicKeyFromPrivate(privateKeyPem) };
    }
    const saved = await this.prisma.presentePushConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    if (saved) {
      return {
        publicKey: saved.publicKey,
        privateKeyPem: decryptText(saved.privateKey),
      };
    }
    const fresh = generateVapidKeys();
    try {
      await this.prisma.presentePushConfig.create({
        data: {
          id: CONFIG_ID,
          publicKey: fresh.publicKey,
          privateKey: encryptText(fresh.privateKeyPem),
        },
      });
      return fresh;
    } catch {
      // Otro proceso las creó al mismo tiempo: se usan esas.
      const other = await this.prisma.presentePushConfig.findUniqueOrThrow({
        where: { id: CONFIG_ID },
      });
      return {
        publicKey: other.publicKey,
        privateKeyPem: decryptText(other.privateKey),
      };
    }
  }

  async publicKey() {
    return { publicKey: (await this.loadKeys()).publicKey };
  }

  async subscribe(
    auth: AuthContext,
    dto: { endpoint: string; p256dh: string; auth: string },
  ) {
    if (!isPushEndpoint(dto.endpoint)) {
      throw new BadRequestException('Este navegador no permite avisos');
    }
    await this.prisma.presentePushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: auth.user.id,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        authKey: dto.auth,
      },
      update: {
        userId: auth.user.id,
        p256dh: dto.p256dh,
        authKey: dto.auth,
        failures: 0,
      },
    });
    return { enabled: true };
  }

  async unsubscribe(auth: AuthContext, endpoint: string) {
    await this.prisma.presentePushSubscription.deleteMany({
      where: { userId: auth.user.id, endpoint },
    });
    return { enabled: false };
  }

  async status(auth: AuthContext) {
    const devices = await this.prisma.presentePushSubscription.count({
      where: { userId: auth.user.id },
    });
    return { devices };
  }

  /** Lo que el celular muestra al recibir el aviso: lo pendiente de las últimas horas. */
  async inbox(auth: AuthContext) {
    const since = new Date(Date.now() - KEEP_MS);
    const items = await this.prisma.presentePushMessage.findMany({
      where: {
        userId: auth.user.id,
        deliveredAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: INBOX_LIMIT,
    });
    if (items.length) {
      await this.prisma.presentePushMessage.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { deliveredAt: new Date() },
      });
    }
    return items.map((i) => ({
      title: i.title,
      body: i.body,
      url: i.url,
      tag: i.tag,
    }));
  }

  /** Avisa a estas personas en todos sus celulares con avisos activos. No lanza errores. */
  async notify(userIds: string[], message: PushMessage) {
    const users = [...new Set(userIds)].filter(Boolean);
    if (!users.length) return 0;
    try {
      await this.prisma.presentePushMessage.createMany({
        data: users.map((userId) => ({
          userId,
          title: message.title.slice(0, 120),
          body: message.body.slice(0, 240),
          url: message.url,
          tag: message.tag ?? null,
        })),
      });
      const devices = await this.prisma.presentePushSubscription.findMany({
        where: { userId: { in: users } },
      });
      if (!devices.length) return 0;
      const keys = await this.loadKeys();
      let sent = 0;
      for (const device of devices) {
        if (await this.send(device, keys)) sent += 1;
      }
      return sent;
    } catch (error) {
      this.logger.warn(
        `No se pudieron mandar avisos: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  private async send(
    device: { id: string; endpoint: string; failures: number },
    keys: VapidKeys,
  ) {
    try {
      const response = await fetch(device.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidAuthorization(
            device.endpoint,
            keys,
            this.subject(),
          ),
          TTL: '3600',
          Urgency: 'high',
          'Content-Length': '0',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 404 || response.status === 410) {
        // El celular quitó el permiso o desinstaló: ya no existe esa dirección.
        await this.prisma.presentePushSubscription.delete({
          where: { id: device.id },
        });
        return false;
      }
      if (!response.ok) throw new Error(`respuesta ${response.status}`);
      await this.prisma.presentePushSubscription.update({
        where: { id: device.id },
        data: { lastSentAt: new Date(), failures: 0 },
      });
      return true;
    } catch (error) {
      const failures = device.failures + 1;
      await this.prisma.presentePushSubscription
        .update({ where: { id: device.id }, data: { failures } })
        .catch(() => undefined);
      if (failures >= MAX_FAILURES) {
        await this.prisma.presentePushSubscription
          .delete({ where: { id: device.id } })
          .catch(() => undefined);
      }
      this.logger.warn(
        `Aviso no entregado: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Borra los avisos viejos (2 días). */
  async cleanup(now = new Date()) {
    try {
      await this.prisma.presentePushMessage.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - KEEP_MS) } },
      });
    } catch {
      // Se intenta en la siguiente limpieza.
    }
  }
}
