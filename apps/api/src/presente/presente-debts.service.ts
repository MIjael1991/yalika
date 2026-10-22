import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { DEBT_REMIND_DAYS } from './presente.constants';
import { PresenteRemindersService } from './presente-reminders.service';
import { PresenteWalletService } from './presente-wallet.service';

const DAY = 86_400_000;

/**
 * Adeudos por cancelar con el trabajador en camino. Tequio no guarda dinero del cliente:
 * - El adeudo se suma al siguiente pedido del cliente y lo cobra en efectivo quien lo atienda.
 * - Al cerrar ese trabajo, se descuenta del saldo de quien lo cobró y se abona al del que fue
 *   (si es el mismo trabajador, solo se marca pagado).
 * - Si el cliente le paga directo, el trabajador lo marca como pagado.
 * - Mientras no se pague, el asistente se lo recuerda al cliente cada pocos días.
 */
@Injectable()
export class PresenteDebtsService {
  private readonly logger = new Logger('TequioAdeudos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: PresenteWalletService,
    private readonly reminders: PresenteRemindersService,
  ) {}

  /** Registra lo que debe el cliente y le manda el primer aviso para mañana. */
  async record(input: {
    clientUserId: string;
    requestId: string;
    providerId: string;
    workerName: string;
    amountMxn: number;
    advancedKm: number;
  }) {
    if (input.amountMxn <= 0) return null;
    const existing = await this.prisma.presenteCancelDebt.findUnique({
      where: { requestId: input.requestId },
    });
    if (existing) return existing;
    const now = new Date();
    const debt = await this.prisma.presenteCancelDebt.create({
      data: { ...input, lastRemindedAt: now },
    });
    await this.reminders.remindDebt({
      debtId: debt.id,
      clientUserId: debt.clientUserId,
      amountMxn: debt.amountMxn,
      workerName: debt.workerName,
      remindAt: new Date(now.getTime() + DAY),
    });
    return debt;
  }

  /** Lo que debe el cliente (sin pagar), para avisarle al pedir y al elegir. */
  async mine(auth: AuthContext) {
    const items = await this.prisma.presenteCancelDebt.findMany({
      where: { clientUserId: auth.user.id, settledAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return {
      totalMxn: items.reduce((sum, d) => sum + d.amountMxn, 0),
      items: items.map((d) => ({
        id: d.id,
        amountMxn: d.amountMxn,
        workerName: d.workerName,
        createdAt: d.createdAt,
        inRequestId: d.appliedRequestId,
      })),
    };
  }

  /** Al elegir un presupuesto: lo que debía se suma a este pedido. Devuelve cuánto. */
  async attach(clientUserId: string, requestId: string) {
    await this.prisma.presenteCancelDebt.updateMany({
      where: { clientUserId, settledAt: null, appliedRequestId: null },
      data: { appliedRequestId: requestId },
    });
    return this.totalFor(requestId);
  }

  /** Lo que el trabajador de este pedido cobra además del precio. */
  async totalFor(requestId: string) {
    const sum = await this.prisma.presenteCancelDebt.aggregate({
      where: { appliedRequestId: requestId, settledAt: null },
      _sum: { amountMxn: true },
    });
    return sum._sum.amountMxn ?? 0;
  }

  /** El pedido al que se sumó se canceló o volvió a abrirse: el adeudo queda para el siguiente. */
  async release(requestId: string) {
    await this.prisma.presenteCancelDebt.updateMany({
      where: { appliedRequestId: requestId, settledAt: null },
      data: { appliedRequestId: null },
    });
  }

  /** Se cerró el trabajo donde se cobró: se pasa el dinero de saldo a saldo y se quita el aviso. */
  async settleWithJob(requestId: string, collectorProviderId: string) {
    const debts = await this.prisma.presenteCancelDebt.findMany({
      where: { appliedRequestId: requestId, settledAt: null },
    });
    for (const debt of debts) {
      const marked = await this.prisma.presenteCancelDebt.updateMany({
        where: { id: debt.id, settledAt: null },
        data: { settledAt: new Date(), settledHow: 'NEXT_SERVICE' },
      });
      if (!marked.count) continue;
      if (debt.providerId !== collectorProviderId) {
        await this.wallet.moveCancelDebt(debt, {
          providerId: collectorProviderId,
          requestId,
        });
      }
      await this.reminders.closeDebt(debt.id);
    }
  }

  // ---------- Trabajador ----------

  /** Lo que le deben al trabajador por cancelaciones. */
  async owedToMe(auth: AuthContext) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!provider) return { totalMxn: 0, items: [] };
    const items = await this.prisma.presenteCancelDebt.findMany({
      where: { providerId: provider.id, settledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const clients = await this.prisma.presenteClient.findMany({
      where: { userId: { in: items.map((d) => d.clientUserId) } },
      select: { userId: true, displayName: true },
    });
    const names = new Map(clients.map((c) => [c.userId, c.displayName]));
    return {
      totalMxn: items.reduce((sum, d) => sum + d.amountMxn, 0),
      items: items.map((d) => ({
        id: d.id,
        amountMxn: d.amountMxn,
        clientName: names.get(d.clientUserId) ?? 'Cliente',
        createdAt: d.createdAt,
        inNextRequest: Boolean(d.appliedRequestId),
      })),
    };
  }

  /** El cliente le pagó directo: el trabajador lo marca y ya no se suma a nada. */
  async markPaid(auth: AuthContext, debtId: string) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    const marked = provider
      ? await this.prisma.presenteCancelDebt.updateMany({
          where: { id: debtId, providerId: provider.id, settledAt: null },
          data: {
            settledAt: new Date(),
            settledHow: 'PAID_DIRECT',
            appliedRequestId: null,
          },
        })
      : { count: 0 };
    if (!marked.count) throw new NotFoundException('Ese adeudo ya no está');
    await this.reminders.closeDebt(debtId);
    return this.owedToMe(auth);
  }

  // ---------- Avisos ----------

  /** Vuelve a recordarle al cliente lo que debe, cada pocos días, mientras no se pague. */
  async remindDue(now = new Date()) {
    try {
      const due = await this.prisma.presenteCancelDebt.findMany({
        where: {
          settledAt: null,
          appliedRequestId: null,
          lastRemindedAt: {
            lt: new Date(now.getTime() - DEBT_REMIND_DAYS * DAY),
          },
        },
        take: 200,
      });
      for (const debt of due) {
        await this.reminders.remindDebt({
          debtId: debt.id,
          clientUserId: debt.clientUserId,
          amountMxn: debt.amountMxn,
          workerName: debt.workerName,
          remindAt: now,
        });
        await this.prisma.presenteCancelDebt.update({
          where: { id: debt.id },
          data: { lastRemindedAt: now },
        });
      }
      return due.length;
    } catch (error) {
      this.logger.warn(
        `No se pudieron mandar los avisos de adeudos: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
