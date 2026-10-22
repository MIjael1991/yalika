import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

import { PrismaService } from '../../../prisma/prisma.service';
import type { SubscribePushDto } from './push.dto';
import {
  MAX_SUBSCRIPTIONS_PER_USER,
  buildPushPayload,
  isAllowedPushEndpoint,
  shouldSendPush,
} from './push.logic';

const activeTaskStatuses = ['pending', 'assigned', 'in_progress', 'postponed'];

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private timer?: NodeJS.Timeout;
  private publicKey = '';
  private enabled = false;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('YALIKA_VAPID_PUBLIC');
    const privateKey = this.config.get<string>('YALIKA_VAPID_PRIVATE');
    const subject = this.config.get<string>('YALIKA_VAPID_SUBJECT');

    if (!publicKey || !privateKey || !subject) {
      this.logger.log(
        'Avisos push apagados: faltan YALIKA_VAPID_PUBLIC, YALIKA_VAPID_PRIVATE o YALIKA_VAPID_SUBJECT.',
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } catch {
      this.logger.error('Las llaves VAPID no son válidas; avisos push apagados.');
      return;
    }

    this.publicKey = publicKey;
    this.enabled = true;

    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.tick(), 60_000);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getPublicKey() {
    return { enabled: this.enabled, publicKey: this.enabled ? this.publicKey : null };
  }

  async subscribe(userId: string, dto: SubscribePushDto, userAgent?: string) {
    if (!this.enabled) return { ok: false, enabled: false };
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      return { ok: false, enabled: true, reason: 'endpoint' };
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: {
        userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: userAgent?.slice(0, 300),
        lastSeenAt: new Date(),
      },
      create: {
        endpoint: dto.endpoint,
        userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: userAgent?.slice(0, 300),
      },
    });

    const all = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true },
    });
    const extra = all.slice(MAX_SUBSCRIPTIONS_PER_USER).map((s) => s.id);
    if (extra.length) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: extra } },
      });
    }

    return { ok: true, enabled: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { ok: true };
  }

  /** Revisa los avisos vencidos y los repite hasta que la persona responda. */
  async tick(now = new Date()) {
    if (!this.enabled || this.running) return 0;
    this.running = true;
    let sent = 0;

    try {
      const due = await this.prisma.taskReminder.findMany({
        where: {
          status: 'scheduled',
          remindAt: { lte: now },
          task: { status: { in: activeTaskStatuses } },
        },
        select: {
          id: true,
          taskId: true,
          userId: true,
          remindAt: true,
          task: {
            select: {
              title: true,
              category: true,
              space: { select: { type: true, name: true } },
            },
          },
        },
        orderBy: { remindAt: 'asc' },
        take: 200,
      });

      for (const reminder of due) {
        const state = await this.prisma.reminderPush.findUnique({
          where: { reminderId: reminder.id },
        });

        if (!shouldSendPush(state, reminder.remindAt, now)) continue;

        const subs = await this.prisma.pushSubscription.findMany({
          where: { userId: reminder.userId },
        });
        if (!subs.length) continue;

        const payload = JSON.stringify(buildPushPayload(reminder, reminder.task));
        let delivered = false;

        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 3600, urgency: 'high' },
            );
            delivered = true;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.prisma.pushSubscription.deleteMany({
                where: { id: sub.id },
              });
            } else {
              this.logger.warn(`No se pudo enviar un aviso push (${status ?? 'sin código'}).`);
            }
          }
        }

        if (delivered) {
          const restart = !state || state.lastSentAt.getTime() < reminder.remindAt.getTime();
          await this.prisma.reminderPush.upsert({
            where: { reminderId: reminder.id },
            update: { sentCount: restart ? 1 : (state?.sentCount ?? 0) + 1, lastSentAt: now },
            create: { reminderId: reminder.id, sentCount: 1, lastSentAt: now },
          });
          sent += 1;
        }
      }
    } catch (error) {
      this.logger.error(`Falló la revisión de avisos: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }

    return sent;
  }
}
