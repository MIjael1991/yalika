/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- dobles de prueba */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PresenteWalletService } from './presente-wallet.service';

const PROVIDER_ID = '1a2b3c4d-0000-4000-8000-000000000000';
const OTHER_ID = '9f9f9f9f-0000-4000-8000-000000000000';
const verified = (over: Record<string, unknown> = {}) => ({
  id: PROVIDER_ID,
  status: 'VERIFIED',
  curpHash: 'huella-curp',
  displayName: 'Juan Pérez',
  referredByProviderId: null,
  ...over,
});

/** ¿El renglón cumple el filtro? (solo lo que usa el servicio) */
const matches = (row: any, where: any = {}) =>
  Object.entries(where).every(([key, cond]: [string, any]) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gt' in cond) return row[key] > cond.gt;
      if ('gte' in cond) return row[key] >= cond.gte;
      if ('startsWith' in cond)
        return String(row[key]).startsWith(cond.startsWith);
    }
    return row[key] === cond;
  });

/** Base en memoria: la llave dedupeKey no se repite, igual que en la tabla real. */
function setup(providers: any[] = [verified()]) {
  const rows: any[] = [];
  const insert = (data: any) => {
    if (rows.some((r) => r.dedupeKey === data.dedupeKey)) {
      throw Object.assign(new Error('duplicada'), { code: 'P2002' });
    }
    const row = { id: `e${rows.length}`, createdAt: new Date(), ...data };
    rows.push(row);
    return row;
  };
  const prisma: any = {
    presenteWalletEntry: {
      create: jest.fn(async ({ data }: any) => insert(data)),
      findUnique: jest.fn(
        async ({ where }: any) =>
          rows.find((r) => r.dedupeKey === where.dedupeKey) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter((r) => matches(r, where)).reverse(),
      ),
      count: jest.fn(
        async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
      ),
      aggregate: jest.fn(async ({ where }: any) => {
        const mine = rows.filter((r) => matches(r, where));
        return {
          _sum: {
            amountCents: mine.length
              ? mine.reduce((sum, r) => sum + r.amountCents, 0)
              : null,
          },
        };
      }),
    },
    presenteProvider: {
      findMany: jest.fn(async ({ where }: any) =>
        providers.filter((p) => matches(p, where)),
      ),
      findUnique: jest.fn(
        async ({ where }: any) =>
          providers.find((p) => p.id === where.id) ?? null,
      ),
    },
    presenteAuditEvent: { create: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new PresenteWalletService(prisma), rows, prisma };
}

// Las pruebas fijan 10 % y $100 para que las cuentas sean fáciles de leer.
const env = { ...process.env };
beforeEach(() => {
  process.env.PRESENTE_COMMISSION_PCT = '10';
  process.env.PRESENTE_WELCOME_CREDIT_MXN = '100';
});
afterEach(() => {
  process.env = { ...env };
});

describe('reglas por defecto', () => {
  it('7 % normal, 10 % para fundadores, $100 de regalo a los primeros 500, precio desde $300', async () => {
    delete process.env.PRESENTE_COMMISSION_PCT;
    delete process.env.PRESENTE_WELCOME_CREDIT_MXN;
    const { service } = setup();
    expect(await service.program()).toEqual({
      commissionPct: 7,
      promoCommissionPct: 10,
      minPriceMxn: 300,
      welcome: { creditMxn: 100, limit: 500, left: 500 },
      referralFreeMaxMxn: 50,
    });
    process.env.PRESENTE_WELCOME_LIMIT = '600';
    expect((await service.program()).welcome.left).toBe(600);
  });
});

describe('comisión de fundadores', () => {
  it('paga el 10 % mientras le dura el regalo de $100 y luego el 7 %', async () => {
    delete process.env.PRESENTE_COMMISSION_PCT;
    const { service } = setup();
    await service.ensureWelcome(verified());
    expect(await service.commissionNow(PROVIDER_ID)).toEqual({
      pct: 10,
      promo: true,
      giftLeftMxn: 100,
    });
    await service.chargeCommission(PROVIDER_ID, 'r1', 600); // 10 %: −$60
    expect((await service.commissionNow(PROVIDER_ID)).giftLeftMxn).toBe(40);
    await service.chargeCommission(PROVIDER_ID, 'r2', 600); // aún 10 %: −$60
    await service.chargeCommission(PROVIDER_ID, 'r3', 600); // ya 7 %: −$42
    expect(await service.balanceCents(PROVIDER_ID)).toBe(10_000 - 16_200);
    expect(await service.commissionNow(PROVIDER_ID)).toEqual({
      pct: 7,
      promo: false,
      giftLeftMxn: 0,
    });
  });

  it('quien llega cuando ya no hay regalo paga el 7 % desde el principio', async () => {
    delete process.env.PRESENTE_COMMISSION_PCT;
    process.env.PRESENTE_WELCOME_LIMIT = '0';
    const { service } = setup();
    await service.ensureWelcome(verified());
    expect((await service.commissionNow(PROVIDER_ID)).pct).toBe(7);
    expect((await service.mine(verified())).promo).toBeNull();
  });
});

describe('saldo del trabajador', () => {
  it('regalo de $100 una sola vez, al estar verificado', async () => {
    const { service } = setup();
    await service.ensureWelcome(verified({ status: 'PENDING_REVIEW' }));
    expect(await service.balanceCents(PROVIDER_ID)).toBe(0);
    await service.ensureWelcome(verified());
    await service.ensureWelcome(verified());
    expect(await service.balanceCents(PROVIDER_ID)).toBe(10_000);
  });

  it('el regalo solo alcanza para los primeros (límite configurable)', async () => {
    process.env.PRESENTE_WELCOME_LIMIT = '1';
    const { service, rows } = setup();
    await service.ensureWelcome(verified());
    await service.ensureWelcome(verified({ id: OTHER_ID, curpHash: 'otra' }));
    expect(await service.balanceCents(PROVIDER_ID)).toBe(10_000);
    expect(await service.balanceCents(OTHER_ID)).toBe(0);
    expect(rows[1]).toMatchObject({ kind: 'WELCOME', amountCents: 0 });
  });

  it('con la misma CURP en otro registro no hay otro regalo y pasa el saldo anterior', async () => {
    const { service } = setup();
    await service.ensureWelcome(verified());
    await service.chargeCommission(PROVIDER_ID, 'r1', 1_400); // −$140
    const nuevo = verified({ id: 'ffff0000-0000-4000-8000-000000000000' });
    await service.ensureWelcome(nuevo);
    await service.ensureWelcome(nuevo);
    expect(await service.balanceCents(nuevo.id)).toBe(-4_000);
    expect(await service.balanceCents(PROVIDER_ID)).toBe(0);
  });

  it('cobra el 10% al cerrar, una sola vez por pedido', async () => {
    const { service } = setup();
    await service.ensureWelcome(verified());
    await service.chargeCommission(PROVIDER_ID, 'r1', 500);
    await service.chargeCommission(PROVIDER_ID, 'r1', 500);
    expect(await service.balanceCents(PROVIDER_ID)).toBe(10_000 - 5_000);
  });

  it('sin saldo no cotiza', async () => {
    const { service } = setup();
    await service.ensureWelcome(verified());
    await service.requireBalance(verified());
    await service.chargeCommission(PROVIDER_ID, 'r1', 1_000); // −$100
    await expect(service.requireBalance(verified())).rejects.toThrow(
      ConflictException,
    );
  });

  it('el operador acredita con el código y la clave de rastreo no se repite', async () => {
    const { service, prisma } = setup();
    const result = await service.operatorTopup('op', {
      code: 'yp1a2b3c4d',
      amountMxn: 200,
      reference: 'MBAN 0102',
    });
    expect(result.balanceMxn).toBe(300);
    expect(result.displayName).toBe('Juan Pérez');
    expect(prisma.presenteAuditEvent.create).toHaveBeenCalled();
    await expect(
      service.operatorTopup('op', {
        code: 'YP1A2B3C4D',
        amountMxn: 200,
        reference: 'mban0102',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('valida código, monto y referencia', async () => {
    const { service } = setup();
    const topup = (over: Record<string, unknown>) =>
      service.operatorTopup('op', {
        code: 'YP1A2B3C4D',
        amountMxn: 200,
        reference: 'MBAN0102',
        ...over,
      });
    await expect(topup({ code: 'hola' })).rejects.toThrow(BadRequestException);
    await expect(topup({ code: 'YP99999999' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(topup({ amountMxn: 50 })).rejects.toThrow(BadRequestException);
    await expect(topup({ reference: '$$' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('el trabajador ve saldo, código, servicios gratis y movimientos', async () => {
    const { service } = setup();
    const mine = await service.mine(verified());
    expect(mine).toMatchObject({
      balanceMxn: 100,
      canQuote: true,
      low: false,
      commissionPct: 10,
      code: 'YP1A2B3C4D',
      referral: { freeServices: 0, maxFreeMxn: 50 },
    });
    expect(mine.entries[0].label).toBe('Regalo de bienvenida');
  });
});

describe('recomendar', () => {
  const referrer = verified();
  const referred = (over: Record<string, unknown> = {}) =>
    verified({
      id: OTHER_ID,
      curpHash: 'otra',
      displayName: 'Ana López',
      referredByProviderId: PROVIDER_ID,
      ...over,
    });

  it('gana un servicio gratis cuando su recomendado está aprobado y recarga', async () => {
    const { service } = setup([referrer, referred()]);
    expect(await service.rewardReferrer(OTHER_ID)).toBe(false); // aún no recarga
    await service.operatorTopup('op', {
      code: 'YP9F9F9F9F',
      amountMxn: 200,
      reference: 'MBAN0001',
    });
    expect(await service.freeServices(PROVIDER_ID)).toBe(1);
    // Otra recarga del mismo recomendado no da otro premio.
    await service.operatorTopup('op', {
      code: 'YP9F9F9F9F',
      amountMxn: 200,
      reference: 'MBAN0002',
    });
    expect(await service.freeServices(PROVIDER_ID)).toBe(1);
  });

  it('no cuenta si el recomendado recibió el regalo de fundador', async () => {
    const { service } = setup([referrer, referred()]);
    await service.ensureWelcome(referred());
    await service.operatorTopup('op', {
      code: 'YP9F9F9F9F',
      amountMxn: 200,
      reference: 'MBAN0009',
    });
    expect(await service.freeServices(PROVIDER_ID)).toBe(0);
  });

  it('si el recomendado no está aprobado no hay premio', async () => {
    const { service } = setup([
      referrer,
      referred({ status: 'PENDING_REVIEW' }),
    ]);
    await service.operatorTopup('op', {
      code: 'YP9F9F9F9F',
      amountMxn: 200,
      reference: 'MBAN0003',
    });
    expect(await service.freeServices(PROVIDER_ID)).toBe(0);
  });

  it('se acumulan: cada recomendado nuevo da un servicio gratis', async () => {
    const others = Array.from({ length: 6 }, (_, i) =>
      referred({ id: `${i}0000000-0000-4000-8000-00000000000${i}` }),
    );
    const { service, rows } = setup([referrer, ...others]);
    for (const other of others) {
      rows.push({
        providerId: other.id,
        kind: 'TOPUP',
        amountCents: 20_000,
        dedupeKey: `t${other.id}`,
        createdAt: new Date(),
      });
      await service.rewardReferrer(other.id);
    }
    expect(await service.freeServices(PROVIDER_ID)).toBe(6);
  });

  it('no cuenta si el recomendado ya había estado registrado con su CURP', async () => {
    const { service, rows } = setup([referrer, referred()]);
    rows.push({
      providerId: 'registro-anterior',
      kind: 'WELCOME',
      amountCents: 0,
      dedupeKey: 'welcome:otra',
      createdAt: new Date(),
    });
    await service.operatorTopup('op', {
      code: 'YP9F9F9F9F',
      amountMxn: 200,
      reference: 'MBAN0009',
    });
    expect(await service.freeServices(PROVIDER_ID)).toBe(0);
  });

  it('no cuenta si quien recomendó ya no está verificado', async () => {
    const { service } = setup([verified({ status: 'SUSPENDED' }), referred()]);
    await service.operatorTopup('op', {
      code: 'YP9F9F9F9F',
      amountMxn: 200,
      reference: 'MBAN0010',
    });
    expect(await service.freeServices(PROVIDER_ID)).toBe(0);
  });

  it('el servicio gratis perdona hasta $50 de la comisión y se usa una vez', async () => {
    const { service, rows } = setup();
    await service.ensureWelcome(verified());
    rows.push({
      providerId: PROVIDER_ID,
      kind: 'FREE_SERVICE',
      amountCents: 0,
      dedupeKey: 'referral:x',
      createdAt: new Date(),
    });
    await service.chargeCommission(PROVIDER_ID, 'r1', 300); // $30: gratis
    expect(await service.balanceCents(PROVIDER_ID)).toBe(10_000);
    expect(await service.freeServices(PROVIDER_ID)).toBe(0);
    await service.chargeCommission(PROVIDER_ID, 'r2', 300); // ya sin servicio gratis
    expect(await service.balanceCents(PROVIDER_ID)).toBe(7_000);
  });

  it('en un trabajo grande solo se perdonan $50', async () => {
    const { service, rows } = setup();
    await service.ensureWelcome(verified());
    rows.push({
      providerId: PROVIDER_ID,
      kind: 'FREE_SERVICE',
      amountCents: 0,
      dedupeKey: 'referral:y',
      createdAt: new Date(),
    });
    await service.chargeCommission(PROVIDER_ID, 'r1', 2_000); // $200 − $50
    expect(await service.balanceCents(PROVIDER_ID)).toBe(10_000 - 15_000);
  });
});
