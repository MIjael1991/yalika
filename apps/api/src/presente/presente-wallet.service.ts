import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  mercadoPagoSettings,
  ONLINE_TOPUP_AMOUNTS,
} from './presente-mercadopago.domain';
import {
  LOW_BALANCE_MXN,
  MAX_TOPUP_MXN,
  MIN_PRICE_MXN,
  MIN_TOPUP_MXN,
  REFERRAL_FREE_MAX_MXN,
} from './presente.constants';
import {
  centsToMxn,
  commissionFor,
  commissionPctSetting,
  commissionCents,
  promoCommissionPctSetting,
  normalizeReference,
  parseWalletCode,
  topupInstructions,
  walletCode,
  welcomeCreditSetting,
  welcomeLimitSetting,
} from './presente-wallet.domain';

type ProviderForWallet = {
  id: string;
  status: string;
  curpHash: string | null;
};

const KIND_LABEL: Record<string, string> = {
  WELCOME: 'Regalo de bienvenida',
  TOPUP: 'Recarga',
  COMMISSION: 'Comisión de Yalika',
  CARRY: 'Saldo de tu registro anterior',
  FREE_SERVICE: 'Ganaste un servicio gratis',
  FREE_USED: 'Servicio gratis usado',
  CANCEL_FEE: 'Cuota de cancelación que te debían',
  DEBT_COLLECTED: 'Adeudo que cobraste para otro trabajador',
};

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Saldo del trabajador, estilo recarga: regalo de bienvenida (amarrado a la CURP), comisión
 * al llegar con el PIN y recargas que acredita el operador. Sin saldo no se puede cotizar.
 * El saldo solo paga comisiones de Yalika: no se retira. La única excepción es el adeudo de un
 * cliente que canceló: lo cobra en efectivo quien atiende su siguiente pedido y se pasa, de su
 * saldo, al saldo del trabajador que fue.
 */
@Injectable()
export class PresenteWalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserta un movimiento; si ya existe (misma llave), no hace nada y devuelve false. */
  private async add(data: Prisma.PresenteWalletEntryUncheckedCreateInput) {
    try {
      await this.prisma.presenteWalletEntry.create({ data });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /**
   * Qué comisión le toca hoy: 10 % mientras le dura el regalo de fundador (lo que ha pagado de
   * comisiones no llega todavía a su regalo) y 5 % después o si no tuvo regalo.
   */
  async commissionNow(providerId: string) {
    const [gift, paid] = await Promise.all([
      this.prisma.presenteWalletEntry.aggregate({
        where: { providerId, kind: 'WELCOME', amountCents: { gt: 0 } },
        _sum: { amountCents: true },
      }),
      this.prisma.presenteWalletEntry.aggregate({
        where: { providerId, kind: 'COMMISSION' },
        _sum: { amountCents: true },
      }),
    ]);
    return commissionFor(
      gift._sum.amountCents ?? 0,
      -(paid._sum.amountCents ?? 0),
    );
  }

  async balanceCents(providerId: string) {
    const sum = await this.prisma.presenteWalletEntry.aggregate({
      where: { providerId },
      _sum: { amountCents: true },
    });
    return sum._sum.amountCents ?? 0;
  }

  /**
   * Regalo de bienvenida, una sola vez por CURP: si la persona se dio de baja y volvió a
   * registrarse, no recibe otro regalo y su saldo anterior (a favor o en contra) pasa al nuevo.
   */
  async ensureWelcome(provider: ProviderForWallet, actorUserId?: string) {
    if (provider.status !== 'VERIFIED' || !provider.curpHash) return;
    const key = `welcome:${provider.curpHash}`;
    const previous = await this.prisma.presenteWalletEntry.findUnique({
      where: { dedupeKey: key },
    });
    if (previous) {
      if (previous.providerId !== provider.id) {
        await this.carryOver(previous.providerId, provider.id, actorUserId);
      }
      return;
    }
    // Solo los primeros (200 por defecto) reciben el regalo. A los demás se les deja una marca
    // en $0 para reconocer su CURP si se dan de baja y vuelven.
    const given = await this.prisma.presenteWalletEntry.count({
      where: { kind: 'WELCOME', amountCents: { gt: 0 } },
    });
    const credit = given < welcomeLimitSetting() ? welcomeCreditSetting() : 0;
    await this.add({
      providerId: provider.id,
      kind: 'WELCOME',
      amountCents: credit * 100,
      dedupeKey: key,
      note: credit ? null : 'El regalo de bienvenida ya se terminó',
      createdByUserId: actorUserId ?? null,
    });
  }

  /**
   * Adeudo por cancelar que cobró otro trabajador en el siguiente pedido del cliente: él recibió
   * el efectivo, así que se descuenta de su saldo y se abona al del trabajador que fue.
   */
  async moveCancelDebt(
    debt: {
      id: string;
      providerId: string;
      workerName: string;
      amountMxn: number;
      requestId: string;
    },
    collector: { providerId: string; requestId: string },
  ) {
    const cents = debt.amountMxn * 100;
    await this.add({
      providerId: collector.providerId,
      kind: 'DEBT_COLLECTED',
      amountCents: -cents,
      dedupeKey: `adeudo:cobro:${debt.id}`,
      requestId: collector.requestId,
      note: `Para ${debt.workerName}`,
    });
    await this.add({
      providerId: debt.providerId,
      kind: 'CANCEL_FEE',
      amountCents: cents,
      dedupeKey: `adeudo:abono:${debt.id}`,
      requestId: debt.requestId,
      note: 'El cliente la pagó en su siguiente pedido',
    });
  }

  // ---------- Recomendar ----------

  /** Servicios gratis que tiene para usar (ganados menos usados). */
  async freeServices(providerId: string) {
    const [earned, used] = await Promise.all([
      this.prisma.presenteWalletEntry.count({
        where: { providerId, kind: 'FREE_SERVICE' },
      }),
      this.prisma.presenteWalletEntry.count({
        where: { providerId, kind: 'FREE_USED' },
      }),
    ]);
    return Math.max(0, earned - used);
  }

  /**
   * Quien recomendó gana un servicio gratis cuando su recomendado ya está aprobado y ya hizo su
   * primera recarga. Una vez por recomendado (se acumulan). No cuenta si el recomendado ya había
   * estado registrado antes con su CURP (se dio de baja y volvió), si recibió el regalo de
   * fundador, ni si quien recomendó ya no está verificado.
   */
  async rewardReferrer(referredProviderId: string, actorUserId?: string) {
    const referred = await this.prisma.presenteProvider.findUnique({
      where: { id: referredProviderId },
      select: {
        id: true,
        status: true,
        displayName: true,
        curpHash: true,
        referredByProviderId: true,
      },
    });
    if (
      !referred?.referredByProviderId ||
      referred.status !== 'VERIFIED' ||
      !referred.curpHash
    ) {
      return false;
    }
    // Persona nueva: su CURP solo ha estado en este registro.
    const firstSeen = await this.prisma.presenteWalletEntry.findUnique({
      where: { dedupeKey: `welcome:${referred.curpHash}` },
      select: { providerId: true, amountCents: true },
    });
    if (firstSeen && firstSeen.providerId !== referred.id) return false;
    // Quien recibió el regalo de fundador ya tuvo su promoción: no cuenta como recomendado.
    if (firstSeen && firstSeen.amountCents > 0) return false;
    const topups = await this.prisma.presenteWalletEntry.count({
      where: { providerId: referred.id, kind: 'TOPUP' },
    });
    if (!topups) return false;
    const referrerId = referred.referredByProviderId;
    const referrer = await this.prisma.presenteProvider.findUnique({
      where: { id: referrerId },
      select: { status: true },
    });
    if (referrer?.status !== 'VERIFIED') return false;
    return this.add({
      providerId: referrerId,
      kind: 'FREE_SERVICE',
      amountCents: 0,
      dedupeKey: `referral:${referred.id}`,
      note: `Recomendaste a ${referred.displayName.split(' ')[0]}`,
      createdByUserId: actorUserId ?? null,
    });
  }

  private async carryOver(fromId: string, toId: string, actorUserId?: string) {
    const cents = await this.balanceCents(fromId);
    if (cents === 0) return;
    try {
      await this.prisma.$transaction([
        this.prisma.presenteWalletEntry.create({
          data: {
            providerId: fromId,
            kind: 'CARRY',
            amountCents: -cents,
            dedupeKey: `carry-out:${fromId}`,
            createdByUserId: actorUserId ?? null,
          },
        }),
        this.prisma.presenteWalletEntry.create({
          data: {
            providerId: toId,
            kind: 'CARRY',
            amountCents: cents,
            dedupeKey: `carry-in:${fromId}`,
            createdByUserId: actorUserId ?? null,
          },
        }),
      ]);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /** Saldo del trabajador que pregunta; solo para registros verificados. */
  async mineFor(userId: string) {
    const provider = await this.prisma.presenteProvider.findUnique({
      where: { userId },
      select: { id: true, status: true, curpHash: true },
    });
    if (!provider || !['VERIFIED', 'SUSPENDED'].includes(provider.status)) {
      throw new NotFoundException(
        'Tu saldo aparece cuando aprueben tu registro',
      );
    }
    return this.mine(provider);
  }

  /** Antes de cotizar: sin saldo (cero o en contra) no se puede. */
  async requireBalance(provider: ProviderForWallet) {
    await this.ensureWelcome(provider);
    if ((await this.balanceCents(provider.id)) <= 0) {
      throw new ConflictException(
        'Te quedaste sin saldo. Recarga para seguir cotizando.',
      );
    }
  }

  /**
   * Al cerrar el trabajo (el cliente confirmó o pasaron 48 h): comisión sobre el precio final,
   * una sola vez por pedido.
   */
  async chargeCommission(
    providerId: string,
    requestId: string,
    amountMxn: number,
  ) {
    const { pct } = await this.commissionNow(providerId);
    const cents = commissionCents(amountMxn, pct);
    if (cents <= 0) return;
    const price = `$${amountMxn.toLocaleString('es-MX')}`;
    // Servicio gratis por recomendar: se perdonan hasta $50 de esta comisión.
    let waived = 0;
    if ((await this.freeServices(providerId)) > 0) {
      waived = Math.min(cents, REFERRAL_FREE_MAX_MXN * 100);
      const used = await this.add({
        providerId,
        kind: 'FREE_USED',
        amountCents: 0,
        dedupeKey: `free:${requestId}`,
        requestId,
        note: `Sin comisión hasta $${REFERRAL_FREE_MAX_MXN} en el trabajo de ${price}`,
      });
      if (!used) waived = 0;
    }
    const charged = cents - waived;
    await this.add({
      providerId,
      kind: 'COMMISSION',
      amountCents: -charged,
      dedupeKey: `commission:${requestId}`,
      requestId,
      note: waived
        ? `${pct}% de ${price}, menos tu servicio gratis`
        : `${pct}% de ${price}`,
    });
  }

  private async summary(providerId: string, take: number) {
    const [cents, entries] = await Promise.all([
      this.balanceCents(providerId),
      this.prisma.presenteWalletEntry.findMany({
        where: { providerId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);
    return {
      balanceMxn: centsToMxn(cents),
      entries: entries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        label: KIND_LABEL[entry.kind] ?? entry.kind,
        amountMxn: centsToMxn(entry.amountCents),
        note: entry.note,
        reference: entry.reference,
        requestId: entry.requestId,
        createdAt: entry.createdAt,
      })),
    };
  }

  /**
   * Reglas para quien se va a registrar: comisión, precio mínimo, regalo de fundador (cuántos
   * lugares quedan) y el premio por recomendar.
   */
  async program() {
    const limit = welcomeLimitSetting();
    const given = await this.prisma.presenteWalletEntry.count({
      where: { kind: 'WELCOME', amountCents: { gt: 0 } },
    });
    return {
      commissionPct: commissionPctSetting(),
      promoCommissionPct: promoCommissionPctSetting(),
      minPriceMxn: MIN_PRICE_MXN,
      welcome: {
        creditMxn: welcomeCreditSetting(),
        limit,
        left: Math.max(0, limit - given),
      },
      referralFreeMaxMxn: REFERRAL_FREE_MAX_MXN,
    };
  }

  /** Lo que ve el trabajador: saldo, movimientos y cómo recargar. */
  async mine(provider: ProviderForWallet) {
    await this.ensureWelcome(provider);
    const { balanceMxn, entries } = await this.summary(provider.id, 30);
    const commission = await this.commissionNow(provider.id);
    return {
      balanceMxn,
      canQuote: balanceMxn > 0,
      low: balanceMxn < LOW_BALANCE_MXN,
      commissionPct: commission.pct,
      // Fundador: 10 % mientras le dura el regalo; cuánto le falta para pasar al 5 %.
      promo: commission.promo
        ? {
            giftLeftMxn: commission.giftLeftMxn,
            nextPct: commissionPctSetting(),
          }
        : null,
      minPriceMxn: MIN_PRICE_MXN,
      code: walletCode(provider.id),
      referral: {
        freeServices: await this.freeServices(provider.id),
        maxFreeMxn: REFERRAL_FREE_MAX_MXN,
      },
      minTopupMxn: MIN_TOPUP_MXN,
      account: topupInstructions(),
      // Recarga con Mercado Pago (tarjeta, OXXO o transferencia), si está configurada.
      online: mercadoPagoSettings().enabled
        ? { amounts: [...ONLINE_TOPUP_AMOUNTS] }
        : null,
      entries,
    };
  }

  private async findByCode(code: string) {
    const prefix = parseWalletCode(code);
    if (!prefix) {
      throw new BadRequestException(
        'El código no es válido. Es "YP" seguido de 8 letras y números.',
      );
    }
    const matches = await this.prisma.presenteProvider.findMany({
      where: { id: { startsWith: prefix } },
      select: { id: true, displayName: true, status: true, curpHash: true },
      take: 2,
    });
    if (matches.length !== 1) {
      throw new NotFoundException('No hay ningún trabajador con ese código');
    }
    return matches[0];
  }

  /** Operador: busca por el código del concepto para confirmar el nombre antes de acreditar. */
  async operatorLookup(code: string) {
    const provider = await this.findByCode(code);
    await this.ensureWelcome(provider);
    const { balanceMxn, entries } = await this.summary(provider.id, 10);
    return {
      providerId: provider.id,
      displayName: provider.displayName,
      code: walletCode(provider.id),
      balanceMxn,
      entries,
    };
  }

  /** Recarga pagada con Mercado Pago (ya confirmada con ellos). Un pago no se acredita dos veces. */
  async creditOnlineTopup(input: {
    providerId: string;
    amountMxn: number;
    paymentId: string;
  }) {
    const added = await this.add({
      providerId: input.providerId,
      kind: 'TOPUP',
      amountCents: input.amountMxn * 100,
      dedupeKey: `topup:mercadopago:${input.paymentId}`,
      reference: input.paymentId,
      note: 'Mercado Pago',
    });
    if (added) await this.rewardReferrer(input.providerId);
    return added;
  }

  /** Operador: acredita una recarga ya vista en el banco. La clave de rastreo no se repite. */
  async operatorTopup(
    operatorUserId: string,
    dto: { code: string; amountMxn: number; reference: string },
  ) {
    const provider = await this.findByCode(dto.code);
    if (dto.amountMxn < MIN_TOPUP_MXN || dto.amountMxn > MAX_TOPUP_MXN) {
      throw new BadRequestException(
        `La recarga debe ser de $${MIN_TOPUP_MXN} a $${MAX_TOPUP_MXN}`,
      );
    }
    const reference = normalizeReference(dto.reference);
    if (!reference) {
      throw new BadRequestException(
        'Escribe la clave de rastreo o el folio del pago (letras y números)',
      );
    }
    const added = await this.add({
      providerId: provider.id,
      kind: 'TOPUP',
      amountCents: dto.amountMxn * 100,
      dedupeKey: `topup:${reference}`,
      reference,
      createdByUserId: operatorUserId,
    });
    if (!added) {
      throw new ConflictException('Esa clave de rastreo ya se acreditó antes');
    }
    await this.prisma.presenteAuditEvent.create({
      data: {
        providerId: provider.id,
        actorUserId: operatorUserId,
        action: 'WALLET_TOPUP',
        metadata: { amountMxn: dto.amountMxn, reference },
      },
    });
    // Si lo recomendó alguien, con su primera recarga quien lo recomendó gana un servicio gratis.
    await this.rewardReferrer(provider.id, operatorUserId);
    return this.operatorLookup(dto.code);
  }
}
