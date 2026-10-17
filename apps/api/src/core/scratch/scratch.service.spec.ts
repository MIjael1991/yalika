import { NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import { createMemberAccessToken } from '../engagement/ticket-claim';
import { ScratchService } from './scratch.service';

// El sorteo usa randomInt: aquí se controla para probar cada caso con exactitud.
jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomInt: jest.fn(),
}));

/**
 * Pruebas con Prisma simulado (sin base de datos). Cubren los raspaditos:
 * configuración, un intento por compra pagada, sorteo con probabilidades y
 * existencias de premios, y canje una sola vez dentro de su vigencia.
 */

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY = '99999999-9999-4999-8999-999999999999';
const PROGRAM = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const DAY = 86_400_000;

const draw = randomInt as unknown as jest.Mock;

function build() {
  const prisma: Record<string, any> = {
    company: { findUnique: jest.fn().mockResolvedValue({ id: COMPANY }) },
    loyaltyProgram: { findUnique: jest.fn() },
    site: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    visit: { findMany: jest.fn().mockResolvedValue([]) },
    scratchCampaign: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn((args: { data: object }) => Promise.resolve({ id: 'camp-new', ...args.data })),
    },
    scratchPrize: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    scratchAttempt: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'att-1', ...args.data, prize: args.data.prizeId ? prizeById(args.data.prizeId as string) : null }),
      ),
      update: jest.fn((args: { data: object }) => Promise.resolve({ id: 'att-1', claimCode: 'YALIKA-ABCDE12345', ...args.data })),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma, service: new ScratchService(prisma as never) };
}

let prizeCatalog: Array<Record<string, any>> = [];
const prizeById = (id: string) => prizeCatalog.find((prize) => prize.id === id) ?? null;

function prize(id: string, basisPoints: number, remaining: number | null, extra: Record<string, unknown> = {}) {
  return { id, name: `Premio ${id}`, description: `Desc ${id}`, probabilityBasisPoints: basisPoints, remaining, ...extra };
}

const site = { companyId: COMPANY, status: 'published', slug: 'luna' };
const campaign = { id: 'camp-1', loyaltyProgramId: PROGRAM, validDays: 30, prizes: [] };
const visits = (...ids: string[]) => ids.map((id) => ({ id }));
const playDto = (overrides: Record<string, unknown> = {}) =>
  ({ customerId: CUSTOMER, memberToken: createMemberAccessToken(CUSTOMER, COMPANY), ...overrides }) as never;

/** Deja listo todo lo necesario para jugar; cada prueba cambia solo lo suyo. */
function readyToPlay(options: { prizes?: Array<Record<string, any>>; visitIds?: string[]; usedVisitIds?: string[] } = {}) {
  const ctx = build();
  prizeCatalog = options.prizes ?? [prize('p1', 1000, 5)];
  ctx.prisma.site.findUnique.mockResolvedValue(site);
  ctx.prisma.customer.findUnique.mockResolvedValue({ id: CUSTOMER, companyId: COMPANY });
  ctx.prisma.scratchCampaign.findFirst.mockResolvedValue(campaign);
  ctx.prisma.visit.findMany.mockResolvedValue(visits(...(options.visitIds ?? ['v1'])));
  ctx.prisma.scratchAttempt.findMany.mockResolvedValue((options.usedVisitIds ?? []).map((visitId) => ({ visitId })));
  ctx.prisma.scratchPrize.findMany.mockResolvedValue(prizeCatalog);
  return ctx;
}

beforeEach(() => {
  draw.mockReset();
  draw.mockReturnValue(1);
  prizeCatalog = [];
});

describe('Raspaditos: configurar', () => {
  const dto = (overrides: Record<string, unknown> = {}) =>
    ({
      loyaltyProgramId: PROGRAM,
      name: '  Raspa y gana  ',
      description: ' premios ',
      validDays: 14,
      prizes: [
        { name: ' Café ', description: ' gratis ', probabilityPercent: 10, stock: 20 },
        { name: 'Descuento', probabilityPercent: 30 },
      ],
      ...overrides,
    }) as never;

  const program = { id: PROGRAM, companyId: COMPANY, status: 'active', endsAt: new Date(Date.now() + 30 * DAY) };

  it('la empresa debe existir', async () => {
    const { prisma, service } = build();
    prisma.company.findUnique.mockResolvedValue(null);
    prisma.loyaltyProgram.findUnique.mockResolvedValue(program);

    await expect(service.configure(COMPANY, dto())).rejects.toThrow(NotFoundException);
  });

  it('el Club QR debe ser de esta empresa', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue({ ...program, companyId: OTHER_COMPANY });
    await expect(service.configure(COMPANY, dto())).rejects.toThrow('no pertenece a esta empresa');

    prisma.loyaltyProgram.findUnique.mockResolvedValue(null);
    await expect(service.configure(COMPANY, dto())).rejects.toThrow('no pertenece a esta empresa');
    expect(prisma.scratchCampaign.create).not.toHaveBeenCalled();
  });

  it('el Club QR debe estar activo y vigente', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue({ ...program, status: 'draft' });
    await expect(service.configure(COMPANY, dto())).rejects.toThrow('Primero activa');

    prisma.loyaltyProgram.findUnique.mockResolvedValue({ ...program, endsAt: new Date(Date.now() - 1000) });
    await expect(service.configure(COMPANY, dto())).rejects.toThrow('ya terminó');
  });

  it('las probabilidades no pueden sumar más de 100%', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue(program);
    const prizes = [
      { name: 'A', probabilityPercent: 60 },
      { name: 'B', probabilityPercent: 41 },
    ];

    await expect(service.configure(COMPANY, dto({ prizes }))).rejects.toThrow('100%');
    expect(prisma.scratchCampaign.create).not.toHaveBeenCalled();
  });

  it('sumar exactamente 100% es válido', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue(program);

    await expect(
      service.configure(COMPANY, dto({ prizes: [{ name: 'A', probabilityPercent: 60 }, { name: 'B', probabilityPercent: 40 }] })),
    ).resolves.toBeDefined();
  });

  it('cierra la campaña anterior y crea la nueva en la misma transacción', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue(program);

    await service.configure(COMPANY, dto());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const close = prisma.scratchCampaign.updateMany.mock.calls[0][0];
    expect(close.where).toEqual({ companyId: COMPANY, status: { in: ['active', 'paused'] } });
    expect(close.data.status).toBe('closed');
    expect(close.data.closedAt).toBeInstanceOf(Date);
    expect(prisma.scratchCampaign.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.scratchCampaign.create.mock.invocationCallOrder[0],
    );
  });

  it('guarda probabilidades en puntos base, existencias y orden, con textos limpios', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue(program);

    await service.configure(COMPANY, dto());

    const data = prisma.scratchCampaign.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: 'Raspa y gana',
      description: 'premios',
      status: 'active',
      validDays: 14,
      endsAt: program.endsAt,
      companyId: COMPANY,
      loyaltyProgramId: PROGRAM,
    });
    expect(data.prizes.create).toEqual([
      { name: 'Café', description: 'gratis', probabilityBasisPoints: 1000, stock: 20, remaining: 20, sortOrder: 0, companyId: COMPANY },
      { name: 'Descuento', description: undefined, probabilityBasisPoints: 3000, stock: null, remaining: null, sortOrder: 1, companyId: COMPANY },
    ]);
  });
});

describe('Raspaditos: estado del cliente', () => {
  it('sin campaña activa no hay raspadito', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue(null);

    await expect(service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER)).resolves.toBeNull();
  });

  it('solo busca campañas activas y vigentes de esa empresa y programa', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue(null);

    await service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER);

    const where = prisma.scratchCampaign.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: COMPANY, loyaltyProgramId: PROGRAM, status: 'active' });
    expect(where.startsAt.lte).toBeInstanceOf(Date);
    expect(where.endsAt.gte).toBeInstanceOf(Date);
  });

  it('los intentos disponibles son las compras pagadas menos los ya jugados', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue({ ...campaign, name: 'R', description: null, prizes: [] });
    prisma.visit.findMany.mockResolvedValue(visits('v1', 'v2', 'v3'));
    prisma.scratchAttempt.count.mockResolvedValue(1);

    const status = await service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER);

    expect(status?.availableAttempts).toBe(2);
    expect(prisma.visit.findMany.mock.calls[0][0].where).toMatchObject({ source: 'order', status: 'confirmed', customerId: CUSTOMER });
  });

  it('nunca muestra intentos negativos (por ejemplo, si anularon una compra ya jugada)', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue({ ...campaign, name: 'R', description: null, prizes: [] });
    prisma.visit.findMany.mockResolvedValue(visits('v1'));
    prisma.scratchAttempt.count.mockResolvedValue(3);

    expect((await service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER))?.availableAttempts).toBe(0);
  });

  it('sin compras no consulta intentos y no hay disponibles', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue({ ...campaign, name: 'R', description: null, prizes: [] });

    expect((await service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER))?.availableAttempts).toBe(0);
    expect(prisma.scratchAttempt.count).not.toHaveBeenCalled();
  });

  it('los premios posibles no revelan probabilidad ni existencias', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue({
      ...campaign,
      name: 'R',
      description: null,
      prizes: [prize('p1', 500, 3), prize('p2', 100, null)],
    });

    const status = await service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER);

    expect(status?.possiblePrizes).toEqual([
      { id: 'p1', name: 'Premio p1' },
      { id: 'p2', name: 'Premio p2' },
    ]);
    expect(JSON.stringify(status)).not.toContain('probabilityBasisPoints');
  });

  it('el último intento muestra el código, la vigencia y el nombre del premio', async () => {
    const { prisma, service } = build();
    const expiresAt = new Date(Date.now() + DAY);
    prisma.scratchCampaign.findFirst.mockResolvedValue({ ...campaign, name: 'R', description: null, prizes: [] });
    prisma.scratchAttempt.findFirst.mockResolvedValue({
      status: 'won',
      claimCode: 'YALIKA-ABCDE12345',
      expiresAt,
      prize: { id: 'p1', name: 'Café', probabilityBasisPoints: 1000, remaining: 2 },
    });

    const status = await service.getMemberStatus(COMPANY, PROGRAM, CUSTOMER);

    expect(status?.latestAttempt).toEqual({ status: 'won', claimCode: 'YALIKA-ABCDE12345', expiresAt, prize: { name: 'Café' } });
  });
});

describe('Raspaditos: jugar', () => {
  it('la página debe estar publicada (el nombre se busca limpio y en minúsculas)', async () => {
    const { prisma, service } = build();
    prisma.site.findUnique.mockResolvedValue(null);
    await expect(service.play('  LUNA ', playDto())).rejects.toThrow('no está publicada');
    expect(prisma.site.findUnique).toHaveBeenCalledWith({ where: { slug: 'luna' } });

    prisma.site.findUnique.mockResolvedValue({ ...site, status: 'draft' });
    await expect(service.play('luna', playDto())).rejects.toThrow('no está publicada');
  });

  it('exige la clave de la persona: falsa, de otro cliente o de otro negocio no sirven', async () => {
    const { prisma, service } = build();
    prisma.site.findUnique.mockResolvedValue(site);

    for (const memberToken of [
      'a'.repeat(64),
      createMemberAccessToken('55555555-5555-4555-8555-555555555555', COMPANY),
      createMemberAccessToken(CUSTOMER, OTHER_COMPANY),
    ]) {
      await expect(service.play('luna', playDto({ memberToken }))).rejects.toThrow('Vuelve a identificarte');
    }
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la clave en mayúsculas también es válida (se compara sin importar el tamaño de letra)', async () => {
    const ctx = readyToPlay();
    draw.mockReturnValue(9999);

    await expect(
      ctx.service.play('luna', playDto({ memberToken: createMemberAccessToken(CUSTOMER, COMPANY).toUpperCase() })),
    ).resolves.toBeDefined();
  });

  it('un cliente de otro negocio no juega', async () => {
    const ctx = readyToPlay();
    ctx.prisma.customer.findUnique.mockResolvedValue({ id: CUSTOMER, companyId: OTHER_COMPANY });

    await expect(ctx.service.play('luna', playDto())).rejects.toThrow('El cliente no existe');
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin raspadito activo avisa', async () => {
    const ctx = readyToPlay();
    ctx.prisma.scratchCampaign.findFirst.mockResolvedValue(null);

    await expect(ctx.service.play('luna', playDto())).rejects.toThrow('No hay un raspadito activo');
    expect(ctx.prisma.scratchAttempt.create).not.toHaveBeenCalled();
  });

  it('bloquea la campaña mientras juega (dos intentos a la vez no se pisan)', async () => {
    const ctx = readyToPlay();
    draw.mockReturnValue(9999);

    await ctx.service.play('luna', playDto());

    expect(ctx.prisma.$queryRaw).toHaveBeenCalled();
    expect(String(ctx.prisma.$queryRaw.mock.calls[0][0].join(' '))).toContain('FOR UPDATE');
    expect(ctx.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(ctx.prisma.scratchAttempt.create.mock.invocationCallOrder[0]);
  });

  it('cada compra pagada concede un solo intento', async () => {
    const ctx = readyToPlay({ visitIds: ['v1', 'v2'], usedVisitIds: ['v1', 'v2'] });

    await expect(ctx.service.play('luna', playDto())).rejects.toThrow('No tienes intentos disponibles');
    expect(ctx.prisma.scratchAttempt.create).not.toHaveBeenCalled();
    expect(ctx.prisma.scratchPrize.update).not.toHaveBeenCalled();
  });

  it('sin compras tampoco hay intento', async () => {
    const ctx = readyToPlay({ visitIds: [] });

    await expect(ctx.service.play('luna', playDto())).rejects.toThrow('No tienes intentos disponibles');
  });

  it('usa la compra más antigua que aún no se ha jugado', async () => {
    const ctx = readyToPlay({ visitIds: ['v1', 'v2', 'v3'], usedVisitIds: ['v1'] });
    draw.mockReturnValue(9999);

    await ctx.service.play('luna', playDto());

    expect(ctx.prisma.scratchAttempt.create.mock.calls[0][0].data.visitId).toBe('v2');
    expect(ctx.prisma.visit.findMany.mock.calls[0][0].orderBy).toEqual({ occurredAt: 'asc' });
  });

  it('solo cuentan las compras pagadas y confirmadas de ese cliente y negocio', async () => {
    const ctx = readyToPlay();
    draw.mockReturnValue(9999);

    await ctx.service.play('luna', playDto());

    expect(ctx.prisma.visit.findMany.mock.calls[0][0].where).toEqual({
      companyId: COMPANY,
      customerId: CUSTOMER,
      loyaltyProgramId: PROGRAM,
      source: 'order',
      status: 'confirmed',
    });
  });

  describe('sorteo', () => {
    const prizes = () => [prize('p1', 1000, 5), prize('p2', 2000, null)];

    it.each([
      [1, 'p1'],
      [1000, 'p1'],
      [1001, 'p2'],
      [3000, 'p2'],
    ])('el número %i gana %s', async (number, expected) => {
      const ctx = readyToPlay({ prizes: prizes() });
      draw.mockReturnValue(number);

      const result = await ctx.service.play('luna', playDto());

      expect(result.result).toBe('won');
      expect(ctx.prisma.scratchAttempt.create.mock.calls[0][0].data.prizeId).toBe(expected);
    });

    it.each([3001, 9999, 10000])('el número %i no gana nada', async (number) => {
      const ctx = readyToPlay({ prizes: prizes() });
      draw.mockReturnValue(number);

      const result = await ctx.service.play('luna', playDto());

      expect(result.result).toBe('not_won');
      expect(result.prize).toBeNull();
      expect(result.claimCode).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('el sorteo va de 1 a 10,000 (cada punto base es 0.01%)', async () => {
      const ctx = readyToPlay();

      await ctx.service.play('luna', playDto());

      expect(draw).toHaveBeenCalledWith(1, 10001);
    });

    it('perder también gasta el intento (queda registrado ligado a la compra)', async () => {
      const ctx = readyToPlay();
      draw.mockReturnValue(9999);

      await ctx.service.play('luna', playDto());

      expect(ctx.prisma.scratchAttempt.create.mock.calls[0][0].data).toMatchObject({
        status: 'not_won',
        claimCode: null,
        expiresAt: null,
        visitId: 'v1',
        customerId: CUSTOMER,
        companyId: COMPANY,
        campaignId: 'camp-1',
      });
      expect(ctx.prisma.scratchPrize.update).not.toHaveBeenCalled();
    });

    it('ganar genera código, vigencia en días y descuenta la existencia', async () => {
      const ctx = readyToPlay({ prizes: [prize('p1', 1000, 5)] });
      draw.mockReturnValue(10);
      const before = Date.now();

      const result = await ctx.service.play('luna', playDto());

      expect(result.result).toBe('won');
      expect(result.prize).toEqual({ name: 'Premio p1', description: 'Desc p1' });
      expect(result.claimCode).toMatch(/^YALIKA-[0-9A-F]{10}$/);
      const expiresAt = (result.expiresAt as Date).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * DAY);
      expect(expiresAt).toBeLessThan(Date.now() + 30 * DAY + 1000);
      expect(ctx.prisma.scratchPrize.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { remaining: { decrement: 1 } } });
    });

    it('un premio sin límite no descuenta existencia', async () => {
      const ctx = readyToPlay({ prizes: [prize('p1', 1000, null)] });
      draw.mockReturnValue(10);

      const result = await ctx.service.play('luna', playDto());

      expect(result.result).toBe('won');
      expect(ctx.prisma.scratchPrize.update).not.toHaveBeenCalled();
    });

    it('un premio agotado no se regala: el intento se pierde sin código', async () => {
      const ctx = readyToPlay({ prizes: [prize('p1', 1000, 0), prize('p2', 5000, 9)] });
      draw.mockReturnValue(10);

      const result = await ctx.service.play('luna', playDto());

      expect(result.result).toBe('not_won');
      expect(result.claimCode).toBeNull();
      expect(ctx.prisma.scratchPrize.update).not.toHaveBeenCalled();
    });

    it('el último premio disponible sí se entrega', async () => {
      const ctx = readyToPlay({ prizes: [prize('p1', 1000, 1)] });
      draw.mockReturnValue(10);

      expect((await ctx.service.play('luna', playDto())).result).toBe('won');
      expect(ctx.prisma.scratchPrize.update).toHaveBeenCalledTimes(1);
    });

    it('los códigos de premio no se repiten entre intentos', async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 30; i += 1) {
        const ctx = readyToPlay({ prizes: [prize('p1', 10000, null)] });
        draw.mockReturnValue(1);
        codes.add((await ctx.service.play('luna', playDto())).claimCode as string);
      }
      expect(codes.size).toBe(30);
    });

    it('solo se sortean premios activos de la campaña', async () => {
      const ctx = readyToPlay();
      draw.mockReturnValue(9999);

      await ctx.service.play('luna', playDto());

      expect(ctx.prisma.scratchPrize.findMany.mock.calls[0][0]).toMatchObject({
        where: { campaignId: 'camp-1', status: 'active' },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });
});

describe('Raspaditos: canjear', () => {
  const dto = (overrides: Record<string, unknown> = {}) => ({ claimCode: '  yalika-abcde12345 ', authorizedById: ADMIN, ...overrides }) as never;
  const won = (overrides: Record<string, unknown> = {}) => ({
    id: 'att-1',
    companyId: COMPANY,
    status: 'won',
    expiresAt: new Date(Date.now() + DAY),
    customer: { id: CUSTOMER, name: 'Ana', phone: '5551234567' },
    prize: { id: 'p1', name: 'Café', description: 'gratis', remaining: 4 },
    visit: { status: 'confirmed' },
    ...overrides,
  });

  function ready(attempt: Record<string, unknown> = won()) {
    const ctx = build();
    ctx.prisma.user.findUnique.mockResolvedValue({ id: ADMIN, name: 'Dueña', companyId: COMPANY, status: 'active' });
    ctx.prisma.scratchAttempt.findUnique.mockImplementation((args: { where: { claimCode?: string; id?: string } }) =>
      Promise.resolve(args.where.claimCode ? { id: 'att-1', companyId: attempt.companyId } : attempt),
    );
    return ctx;
  }

  it.each([
    ['no existe', null],
    ['está inactivo', { id: ADMIN, companyId: COMPANY, status: 'inactive' }],
    ['es de otro negocio', { id: ADMIN, companyId: OTHER_COMPANY, status: 'active' }],
  ])('quien autoriza %s: no se canjea', async (_name, user) => {
    const ctx = ready();
    ctx.prisma.user.findUnique.mockResolvedValue(user);

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('usuario autorizador');
    expect(ctx.prisma.scratchAttempt.update).not.toHaveBeenCalled();
  });

  it('el código se busca sin espacios y en mayúsculas', async () => {
    const ctx = ready();

    await ctx.service.redeem(COMPANY, dto());

    expect(ctx.prisma.scratchAttempt.findUnique.mock.calls[0][0].where).toEqual({ claimCode: 'YALIKA-ABCDE12345' });
  });

  it('un código inexistente o de otro negocio da el mismo "no existe"', async () => {
    const ctx = ready();
    ctx.prisma.scratchAttempt.findUnique.mockResolvedValue(null);
    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('El código del premio no existe');

    const other = ready(won({ companyId: OTHER_COMPANY }));
    await expect(other.service.redeem(COMPANY, dto())).rejects.toThrow('El código del premio no existe');
    expect(other.prisma.scratchAttempt.update).not.toHaveBeenCalled();
  });

  it('bloquea el intento mientras canjea (dos cajas a la vez no lo canjean dos veces)', async () => {
    const ctx = ready();

    await ctx.service.redeem(COMPANY, dto());

    expect(String(ctx.prisma.$queryRaw.mock.calls[0][0].join(' '))).toContain('FOR UPDATE');
    expect(ctx.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(ctx.prisma.scratchAttempt.update.mock.invocationCallOrder[0]);
  });

  it('un premio solo se canjea una vez', async () => {
    const ctx = ready(won({ status: 'redeemed' }));

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('ya fue canjeado');
    expect(ctx.prisma.scratchAttempt.update).not.toHaveBeenCalled();
  });

  it.each([
    ['intento sin premio', { status: 'not_won', prize: null }],
    ['intento cancelado', { status: 'cancelled' }],
    ['ganado pero sin premio ligado', { prize: null }],
  ])('%s no tiene premio vigente', async (_name, overrides) => {
    const ctx = ready(won(overrides));

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('no tiene un premio vigente');
  });

  it('si la compra fue anulada o reembolsada, el premio no se entrega', async () => {
    const ctx = ready(won({ visit: { status: 'cancelled' } }));

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('anulada o reembolsada');
    expect(ctx.prisma.scratchAttempt.update).not.toHaveBeenCalled();
  });

  it('un premio vencido se cancela, regresa a la existencia y avisa', async () => {
    const ctx = ready(won({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('ya venció');

    expect(ctx.prisma.scratchAttempt.update).toHaveBeenCalledWith({ where: { id: 'att-1' }, data: { status: 'cancelled' } });
    expect(ctx.prisma.scratchPrize.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { remaining: { increment: 1 } } });
  });

  it('un premio vencido sin límite de existencia no toca el inventario', async () => {
    const ctx = ready(won({ expiresAt: new Date(Date.now() - 1000), prize: { id: 'p1', name: 'Café', remaining: null } }));

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow('ya venció');
    expect(ctx.prisma.scratchPrize.update).not.toHaveBeenCalled();
  });

  it('el cancelado por vencimiento queda guardado aunque se avise con error', async () => {
    const ctx = ready(won({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(ctx.service.redeem(COMPANY, dto())).rejects.toThrow();

    // El error se lanza después de cerrar la transacción: el cambio no se revierte.
    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
    await expect(ctx.prisma.$transaction.mock.results[0].value).resolves.toEqual({ expired: true });
  });

  it('canjear marca quién y cuándo, y devuelve solo lo necesario', async () => {
    const ctx = ready();

    const result = await ctx.service.redeem(COMPANY, dto());

    const update = ctx.prisma.scratchAttempt.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'att-1' });
    expect(update.data.status).toBe('redeemed');
    expect(update.data.redeemedAt).toBeInstanceOf(Date);
    expect(update.data.redeemedById).toBe(ADMIN);
    expect(result).toMatchObject({
      status: 'redeemed',
      customer: { id: CUSTOMER, name: 'Ana', phone: '5551234567' },
      prize: { id: 'p1', name: 'Café', description: 'gratis' },
      authorizedBy: { id: ADMIN, name: 'Dueña' },
    });
    // La existencia ya se descontó al ganar: canjear no la vuelve a mover.
    expect(ctx.prisma.scratchPrize.update).not.toHaveBeenCalled();
  });

  it('un premio sin fecha de vencimiento puede canjearse', async () => {
    const ctx = ready(won({ expiresAt: null }));

    await expect(ctx.service.redeem(COMPANY, dto())).resolves.toMatchObject({ status: 'redeemed' });
  });
});

describe('Raspaditos: consultar campaña', () => {
  it('la empresa debe existir', async () => {
    const { prisma, service } = build();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(service.findByCompany(COMPANY)).rejects.toThrow('La empresa no existe');
  });

  it('trae la campaña más reciente de esa empresa con sus premios', async () => {
    const { prisma, service } = build();
    prisma.scratchCampaign.findFirst.mockResolvedValue({ id: 'camp-1' });

    await service.findByCompany(COMPANY);

    expect(prisma.scratchCampaign.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY }, orderBy: { createdAt: 'desc' } }),
    );
  });
});
