import { BadRequestException, NotFoundException } from '@nestjs/common';

import { LoyaltyService } from './loyalty.service';

/**
 * Pruebas con Prisma simulado (sin base de datos). Cubren las reglas del Club
 * de lealtad: alta, ciclo de vida y avance del cliente (solo visitas confirmadas).
 */

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY = '99999999-9999-4999-8999-999999999999';
const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function build() {
  const prisma = {
    company: { findUnique: jest.fn().mockResolvedValue({ id: COMPANY }) },
    customer: { findUnique: jest.fn() },
    visit: { count: jest.fn().mockResolvedValue(0) },
    customerReward: { findFirst: jest.fn().mockResolvedValue(null) },
    loyaltyProgram: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'lp-1', ...args.data })),
      update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve({ id: args.where.id, ...args.data })),
    },
  };
  return { prisma, service: new LoyaltyService(prisma as never) };
}

function createDto(overrides: Record<string, unknown> = {}) {
  return {
    name: '  Club QR  ',
    requiredVisits: 5,
    rewardDescription: '  Un café gratis  ',
    rewardValidDays: 30,
    startsAt: inDays(-1),
    endsAt: inDays(60),
    companyId: COMPANY,
    ...overrides,
  } as never;
}

describe('Lealtad: alta', () => {
  it('la empresa debe existir', async () => {
    const { prisma, service } = build();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(service.create(createDto())).rejects.toThrow(NotFoundException);
    expect(prisma.loyaltyProgram.create).not.toHaveBeenCalled();
  });

  it('la fecha final debe ser posterior a la inicial (también si son iguales)', async () => {
    const { prisma, service } = build();
    const same = inDays(3);

    await expect(service.create(createDto({ startsAt: same, endsAt: same }))).rejects.toThrow('posterior');
    await expect(service.create(createDto({ startsAt: inDays(9), endsAt: inDays(2) }))).rejects.toThrow('posterior');
    expect(prisma.loyaltyProgram.create).not.toHaveBeenCalled();
  });

  it('nace como borrador, con textos limpios y tipo de premio "custom" por omisión', async () => {
    const { prisma, service } = build();

    await service.create(createDto({ description: ' cada 5 visitas ' }));

    expect(prisma.loyaltyProgram.create.mock.calls[0][0].data).toMatchObject({
      name: 'Club QR',
      description: 'cada 5 visitas',
      requiredVisits: 5,
      rewardType: 'custom',
      rewardDescription: 'Un café gratis',
      rewardValidDays: 30,
      status: 'draft',
      companyId: COMPANY,
    });
  });

  it('respeta el tipo de premio indicado', async () => {
    const { prisma, service } = build();

    await service.create(createDto({ rewardType: ' discount ' }));

    expect(prisma.loyaltyProgram.create.mock.calls[0][0].data.rewardType).toBe('discount');
  });
});

describe('Lealtad: consultar', () => {
  it('listar exige que la empresa exista y solo trae las suyas', async () => {
    const { prisma, service } = build();

    await service.findByCompany(COMPANY);
    expect(prisma.loyaltyProgram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY }, orderBy: { createdAt: 'desc' } }),
    );

    prisma.company.findUnique.mockResolvedValue(null);
    await expect(service.findByCompany(COMPANY)).rejects.toThrow('La empresa no existe');
  });

  it('un programa que no existe da 404', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue(null);

    await expect(service.findOne('nada')).rejects.toThrow('El programa de fidelización no existe');
  });
});

describe('Lealtad: ciclo de vida', () => {
  describe('activar', () => {
    it('no existe', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue(null);
      await expect(service.activate('p')).rejects.toThrow(NotFoundException);
    });

    it('una campaña cerrada no vuelve a activarse', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status: 'closed', endsAt: new Date(Date.now() + DAY) });
      await expect(service.activate('p')).rejects.toThrow('cerrada');
      expect(prisma.loyaltyProgram.update).not.toHaveBeenCalled();
    });

    it('una vencida no se activa', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status: 'draft', endsAt: new Date(Date.now() - 1000) });
      await expect(service.activate('p')).rejects.toThrow('terminó su vigencia');
    });

    it.each(['draft', 'paused'])('desde %s pasa a activa', async (status) => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status, endsAt: new Date(Date.now() + DAY) });

      await service.activate('p');

      expect(prisma.loyaltyProgram.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { status: 'active' } });
    });
  });

  describe('pausar', () => {
    it('una cerrada tiene su propio mensaje', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status: 'closed' });
      await expect(service.pause('p')).rejects.toThrow('cerrada no puede pausarse');
    });

    it.each(['draft', 'paused'])('una %s no se puede pausar', async (status) => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status });
      await expect(service.pause('p')).rejects.toThrow('Solo una campaña activa');
      expect(prisma.loyaltyProgram.update).not.toHaveBeenCalled();
    });

    it('una activa se pausa', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status: 'active' });
      await service.pause('p');
      expect(prisma.loyaltyProgram.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { status: 'paused' } });
    });
  });

  describe('cerrar', () => {
    it('cierra y anota cuándo', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue({ status: 'active' });

      await service.close('p');

      const data = prisma.loyaltyProgram.update.mock.calls[0][0].data;
      expect(data.status).toBe('closed');
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    it('cerrar dos veces no cambia la fecha de cierre', async () => {
      const { prisma, service } = build();
      const closed = { id: 'p', status: 'closed', closedAt: new Date('2026-01-01') };
      prisma.loyaltyProgram.findUnique.mockResolvedValue(closed);

      await expect(service.close('p')).resolves.toBe(closed);
      expect(prisma.loyaltyProgram.update).not.toHaveBeenCalled();
    });

    it('no existe', async () => {
      const { prisma, service } = build();
      prisma.loyaltyProgram.findUnique.mockResolvedValue(null);
      await expect(service.close('p')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('Lealtad: avance del cliente', () => {
  const program = {
    id: 'lp-1',
    name: 'Club QR',
    status: 'active',
    requiredVisits: 5,
    rewardDescription: 'Un café gratis',
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    companyId: COMPANY,
  };
  const customer = { id: 'c-1', name: 'Ana', companyId: COMPANY, phone: '5551234567' };

  function ready(visits: number) {
    const ctx = build();
    ctx.prisma.loyaltyProgram.findUnique.mockResolvedValue(program);
    ctx.prisma.customer.findUnique.mockResolvedValue(customer);
    ctx.prisma.visit.count.mockResolvedValue(visits);
    return ctx;
  }

  it('programa o cliente inexistente da 404', async () => {
    const { prisma, service } = build();
    prisma.loyaltyProgram.findUnique.mockResolvedValue(null);
    await expect(service.progress('lp-1', 'c-1')).rejects.toThrow('El programa de fidelización no existe');

    prisma.loyaltyProgram.findUnique.mockResolvedValue(program);
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.progress('lp-1', 'c-1')).rejects.toThrow('El cliente no existe');
  });

  it('un cliente de otro negocio no puede consultar la campaña', async () => {
    const { prisma, service } = ready(3);
    prisma.customer.findUnique.mockResolvedValue({ ...customer, companyId: OTHER_COMPANY });

    await expect(service.progress('lp-1', 'c-1')).rejects.toThrow(BadRequestException);
    expect(prisma.visit.count).not.toHaveBeenCalled();
  });

  it('cuenta solo visitas confirmadas de ese cliente, esa empresa y esa campaña', async () => {
    const { prisma, service } = ready(2);

    await service.progress('lp-1', 'c-1');

    expect(prisma.visit.count).toHaveBeenCalledWith({
      where: { customerId: 'c-1', companyId: COMPANY, loyaltyProgramId: 'lp-1', status: 'confirmed' },
    });
  });

  it('calcula lo que falta y el porcentaje', async () => {
    const { service } = ready(2);

    const result = await service.progress('lp-1', 'c-1');

    expect(result.progress).toEqual({ confirmedVisits: 2, remainingVisits: 3, percentage: 40, completed: false });
    expect(result.customer).toEqual({ id: 'c-1', name: 'Ana' });
    expect(result.program).toMatchObject({ id: 'lp-1', requiredVisits: 5, rewardDescription: 'Un café gratis' });
  });

  it('no filtra el teléfono ni datos internos del cliente', async () => {
    const { service } = ready(1);

    const result = await service.progress('lp-1', 'c-1');

    expect(JSON.stringify(result)).not.toContain('5551234567');
    expect(Object.keys(result.customer)).toEqual(['id', 'name']);
  });

  it('al llegar a la meta queda completa', async () => {
    const { service } = ready(5);

    expect((await service.progress('lp-1', 'c-1')).progress).toEqual({
      confirmedVisits: 5,
      remainingVisits: 0,
      percentage: 100,
      completed: true,
    });
  });

  it('con más visitas que la meta, el porcentaje no pasa de 100 ni lo que falta es negativo', async () => {
    const { service } = ready(12);

    expect((await service.progress('lp-1', 'c-1')).progress).toEqual({
      confirmedVisits: 12,
      remainingVisits: 0,
      percentage: 100,
      completed: true,
    });
  });

  it('sin visitas empieza en cero', async () => {
    const { service } = ready(0);

    expect((await service.progress('lp-1', 'c-1')).progress).toEqual({
      confirmedVisits: 0,
      remainingVisits: 5,
      percentage: 0,
      completed: false,
    });
  });

  it('muestra el premio más reciente del cliente en esa campaña', async () => {
    const { prisma, service } = ready(5);
    const reward = { id: 'r-1', earnedAt: new Date() };
    prisma.customerReward.findFirst.mockResolvedValue(reward);

    const result = await service.progress('lp-1', 'c-1');

    expect(result.reward).toBe(reward);
    expect(prisma.customerReward.findFirst).toHaveBeenCalledWith({
      where: { customerId: 'c-1', loyaltyProgramId: 'lp-1' },
      orderBy: { earnedAt: 'desc' },
    });
  });
});
