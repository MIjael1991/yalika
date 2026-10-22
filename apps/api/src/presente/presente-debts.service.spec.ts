/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import { NotFoundException } from '@nestjs/common';

import { PresenteDebtsService } from './presente-debts.service';

const auth = (id: string) => ({ user: { id } }) as any;

const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  clientUserId: 'c1',
  requestId: 'r-viejo',
  providerId: 'p-juan',
  workerName: 'Juan',
  amountMxn: 90,
  appliedRequestId: 'r-nuevo',
  settledAt: null,
  ...over,
});

function setup(opts: { debts?: any[]; marked?: number; existing?: any } = {}) {
  const prisma: any = {
    presenteCancelDebt: {
      findUnique: jest.fn(async () => opts.existing ?? null),
      create: jest.fn(async (args: any) => ({ id: 'd1', ...args.data })),
      findMany: jest.fn(async () => opts.debts ?? []),
      updateMany: jest.fn(async () => ({ count: opts.marked ?? 1 })),
      update: jest.fn(),
      aggregate: jest.fn(async () => ({ _sum: { amountMxn: 90 } })),
    },
    presenteProvider: { findUnique: jest.fn(async () => ({ id: 'p-juan' })) },
    presenteClient: {
      findMany: jest.fn(async () => [{ userId: 'c1', displayName: 'Ana' }]),
    },
  };
  const wallet: any = { moveCancelDebt: jest.fn() };
  const reminders: any = { remindDebt: jest.fn(), closeDebt: jest.fn() };
  return {
    service: new PresenteDebtsService(prisma, wallet, reminders),
    prisma,
    wallet,
    reminders,
  };
}

describe('Adeudos por cancelar', () => {
  it('se registra y el asistente se lo recuerda al cliente al día siguiente', async () => {
    const { service, prisma, reminders } = setup();
    await service.record({
      clientUserId: 'c1',
      requestId: 'r-viejo',
      providerId: 'p-juan',
      workerName: 'Juan',
      amountMxn: 90,
      advancedKm: 6,
    });
    expect(prisma.presenteCancelDebt.create).toHaveBeenCalled();
    const call = reminders.remindDebt.mock.calls[0][0];
    expect(call).toMatchObject({ clientUserId: 'c1', amountMxn: 90 });
    expect(call.remindAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3_600_000,
    );
  });

  it('sin cuota no hay adeudo, y no se registra dos veces el mismo pedido', async () => {
    const free = setup();
    await free.service.record({
      clientUserId: 'c1',
      requestId: 'r',
      providerId: 'p',
      workerName: 'Juan',
      amountMxn: 0,
      advancedKm: 0,
    });
    expect(free.prisma.presenteCancelDebt.create).not.toHaveBeenCalled();
    const twice = setup({ existing: debt() });
    await twice.service.record({
      clientUserId: 'c1',
      requestId: 'r-viejo',
      providerId: 'p-juan',
      workerName: 'Juan',
      amountMxn: 90,
      advancedKm: 6,
    });
    expect(twice.prisma.presenteCancelDebt.create).not.toHaveBeenCalled();
  });

  it('al elegir el siguiente presupuesto se suma a ese pedido', async () => {
    const { service, prisma } = setup();
    expect(await service.attach('c1', 'r-nuevo')).toBe(90);
    expect(prisma.presenteCancelDebt.updateMany.mock.calls[0][0]).toEqual({
      where: { clientUserId: 'c1', settledAt: null, appliedRequestId: null },
      data: { appliedRequestId: 'r-nuevo' },
    });
  });

  it('lo cobra otro trabajador: sale de su saldo y entra al saldo de quien fue', async () => {
    const { service, wallet, reminders } = setup({ debts: [debt()] });
    await service.settleWithJob('r-nuevo', 'p-pedro');
    expect(wallet.moveCancelDebt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'd1', providerId: 'p-juan' }),
      { providerId: 'p-pedro', requestId: 'r-nuevo' },
    );
    expect(reminders.closeDebt).toHaveBeenCalledWith('d1');
  });

  it('si lo atiende el mismo trabajador, solo se marca pagado; nunca se cobra dos veces', async () => {
    const same = setup({ debts: [debt()] });
    await same.service.settleWithJob('r-nuevo', 'p-juan');
    expect(same.wallet.moveCancelDebt).not.toHaveBeenCalled();
    expect(same.reminders.closeDebt).toHaveBeenCalled();
    const again = setup({ debts: [debt()], marked: 0 });
    await again.service.settleWithJob('r-nuevo', 'p-pedro');
    expect(again.wallet.moveCancelDebt).not.toHaveBeenCalled();
  });

  it('el trabajador marca que le pagaron directo; otro no puede', async () => {
    const { service, prisma, reminders } = setup();
    await service.markPaid(auth('w-juan'), 'd1');
    expect(prisma.presenteCancelDebt.updateMany.mock.calls[0][0]).toMatchObject(
      {
        where: { id: 'd1', providerId: 'p-juan', settledAt: null },
        data: { settledHow: 'PAID_DIRECT', appliedRequestId: null },
      },
    );
    expect(reminders.closeDebt).toHaveBeenCalledWith('d1');
    const other = setup({ marked: 0 });
    await expect(other.service.markPaid(auth('w-otro'), 'd1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('vuelve a recordar cada 3 días lo que no se ha pagado', async () => {
    const { service, prisma, reminders } = setup({
      debts: [debt({ appliedRequestId: null })],
    });
    const now = new Date();
    expect(await service.remindDue(now)).toBe(1);
    const where = prisma.presenteCancelDebt.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ settledAt: null, appliedRequestId: null });
    expect(where.lastRemindedAt.lt.getTime()).toBe(
      now.getTime() - 3 * 86_400_000,
    );
    expect(reminders.remindDebt).toHaveBeenCalledWith(
      expect.objectContaining({ debtId: 'd1', remindAt: now }),
    );
  });
});
