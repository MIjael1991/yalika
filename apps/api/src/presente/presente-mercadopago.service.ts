import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { publicBaseUrl } from '../common/public-url';
import { PrismaService } from '../prisma/prisma.service';
import {
  mercadoPagoSettings,
  ONLINE_TOPUP_AMOUNTS,
  paymentOutcome,
  returnBase,
  topupIdFrom,
  topupReference,
  type MercadoPagoPayment,
} from './presente-mercadopago.domain';
import { PresentePushService } from './presente-push.service';
import { PresenteWalletService } from './presente-wallet.service';

const TIMEOUT_MS = 15_000;

/**
 * Recargas con Mercado Pago. Yalika no guarda datos de tarjetas: la persona paga en la página de
 * Mercado Pago y el saldo se suma solo cuando Mercado Pago confirma el pago aprobado. Nunca se
 * cree lo que diga el aviso que llega: siempre se le pregunta a Mercado Pago con la clave propia.
 */
@Injectable()
export class PresenteMercadoPagoService {
  private readonly logger = new Logger(PresenteMercadoPagoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: PresenteWalletService,
    private readonly push: PresentePushService,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const settings = mercadoPagoSettings();
    if (!settings.enabled) {
      throw new ServiceUnavailableException(
        'La recarga con Mercado Pago todavía no está activa. Usa la transferencia.',
      );
    }
    const response = await fetch(`${settings.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      this.logger.warn(`Mercado Pago ${path} respondió ${response.status}`);
      throw new ServiceUnavailableException(
        'Mercado Pago no respondió. Intenta de nuevo en un momento.',
      );
    }
    return (await response.json()) as T;
  }

  private async myProvider(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
      select: { id: true, status: true },
    });
    if (!provider || !['VERIFIED', 'SUSPENDED'].includes(provider.status)) {
      throw new NotFoundException(
        'Podrás recargar cuando aprueben tu registro',
      );
    }
    return provider;
  }

  /** Crea el cobro en Mercado Pago y devuelve la página donde se paga. */
  async start(auth: AuthContext, amountMxn: number, origin?: string) {
    if (!(ONLINE_TOPUP_AMOUNTS as readonly number[]).includes(amountMxn)) {
      throw new BadRequestException(
        `Elige ${ONLINE_TOPUP_AMOUNTS.map((a) => `$${a}`).join(', ')}`,
      );
    }
    const provider = await this.myProvider(auth);
    const base = returnBase(publicBaseUrl(), origin);
    if (!base) {
      throw new ServiceUnavailableException(
        'Falta configurar la dirección pública de Yalika (YALIKA_PUBLIC_URL)',
      );
    }
    const topup = await this.prisma.presenteTopup.create({
      data: { providerId: provider.id, amountMxn },
    });
    const back = `${base}/tequio/trabajo?recarga=${topup.id}`;
    const secure = base.startsWith('https://');
    const preference = await this.call<{
      id: string;
      init_point: string;
    }>('/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': topup.id },
      body: JSON.stringify({
        items: [
          {
            id: 'recarga-tequio',
            title: 'Recarga de saldo Tequio (Yalika)',
            quantity: 1,
            unit_price: amountMxn,
            currency_id: 'MXN',
          },
        ],
        external_reference: topupReference(topup.id),
        back_urls: { success: back, failure: back, pending: back },
        // Mercado Pago solo regresa solo a direcciones seguras (https).
        ...(secure ? { auto_return: 'approved' } : {}),
        // El aviso de pago solo puede llegar a una dirección pública.
        ...(secure
          ? {
              notification_url: `${base}/api/yalika/presente/webhooks/mercadopago`,
            }
          : {}),
        statement_descriptor: 'YALIKA TEQUIO',
      }),
    });
    await this.prisma.presenteTopup.update({
      where: { id: topup.id },
      data: { preferenceId: preference.id },
    });
    return { id: topup.id, url: preference.init_point };
  }

  /**
   * Al regresar de Mercado Pago: busca el pago de esa recarga y la acredita si ya se aprobó.
   * Sirve también cuando el aviso automático no llega (por ejemplo, en la computadora de pruebas).
   */
  async check(auth: AuthContext, topupId: string) {
    const provider = await this.myProvider(auth);
    const topup = await this.prisma.presenteTopup.findUnique({
      where: { id: topupId },
    });
    if (!topup || topup.providerId !== provider.id) {
      throw new NotFoundException('Recarga no encontrada');
    }
    if (topup.status === 'PENDING') {
      const found = await this.call<{ results?: MercadoPagoPayment[] }>(
        `/v1/payments/search?external_reference=${encodeURIComponent(topupReference(topup.id))}&sort=date_created&criteria=desc`,
      );
      for (const payment of found.results ?? []) {
        if (await this.settle(payment)) break;
      }
    }
    const fresh = await this.prisma.presenteTopup.findUniqueOrThrow({
      where: { id: topupId },
    });
    return { id: fresh.id, amountMxn: fresh.amountMxn, status: fresh.status };
  }

  /** Aviso automático de Mercado Pago. Solo se usa el número de pago; lo demás se le pregunta a ellos. */
  async webhook(query: Record<string, unknown>, body: unknown) {
    const data = (body ?? {}) as {
      type?: string;
      topic?: string;
      data?: { id?: string | number };
    };
    const text = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    const type =
      text(query.type) ||
      text(query.topic) ||
      text(data.type) ||
      text(data.topic);
    const id = text(query['data.id']) || text(query.id) || text(data.data?.id);
    if (type !== 'payment' || !/^\d{1,20}$/.test(id)) return { received: true };
    const payment = await this.call<MercadoPagoPayment>(`/v1/payments/${id}`);
    await this.settle(payment);
    return { received: true };
  }

  /** Acredita (una sola vez) o marca la recarga según lo que diga Mercado Pago. */
  private async settle(payment: MercadoPagoPayment) {
    const topupId = topupIdFrom(payment.external_reference);
    if (!topupId) return false;
    const topup = await this.prisma.presenteTopup.findUnique({
      where: { id: topupId },
    });
    if (!topup || topup.status === 'APPROVED')
      return topup?.status === 'APPROVED';
    const paymentId = String(payment.id);
    const outcome = paymentOutcome(payment, topup.amountMxn);
    if (outcome === 'WAIT') return false;
    if (outcome === 'REJECTED') {
      await this.prisma.presenteTopup.updateMany({
        where: { id: topup.id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      return false;
    }
    const moved = await this.prisma.presenteTopup.updateMany({
      where: { id: topup.id, status: { in: ['PENDING', 'REJECTED'] } },
      data: { status: 'APPROVED', paymentId, creditedAt: new Date() },
    });
    if (!moved.count) return true;
    const added = await this.wallet.creditOnlineTopup({
      providerId: topup.providerId,
      amountMxn: topup.amountMxn,
      paymentId,
    });
    if (!added) {
      this.logger.warn(`El pago ${paymentId} ya estaba acreditado`);
      return true;
    }
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { id: topup.providerId },
      select: { userId: true },
    });
    if (provider) {
      void this.push.notify([provider.userId], {
        title: 'Tu recarga ya está en tu saldo',
        body: `Se sumaron $${topup.amountMxn} con Mercado Pago. Ya puedes mandar presupuestos.`,
        url: '/tequio/trabajo',
        tag: `recarga-${topup.id}`,
      });
    }
    return true;
  }
}
