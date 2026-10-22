/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import {
  PresenteRemindersService,
  VISIT_REMINDER_MINUTES,
} from './presente-reminders.service';

function setup(existing: any = null) {
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ companyId: 'co' })) },
    task: {
      findUnique: jest.fn(async () => existing),
      findMany: jest.fn(async () => [{ id: 't1' }, { id: 't2' }]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    taskReminder: { upsert: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { service: new PresenteRemindersService(prisma), prisma };
}

const visit = (at: Date) => ({
  requestId: 'r1',
  scheduledFor: at,
  clientUserId: 'c1',
  clientName: 'Ana',
  workerUserId: 'w1',
  workerName: 'Vulcanizadora El Rayo',
  placeLabel: 'Casa de mamá',
});

describe('Recordatorios de visitas agendadas', () => {
  it('a los dos les aparece en Mi día con aviso una hora antes', async () => {
    const at = new Date(Date.now() + 5 * 3_600_000);
    const { service, prisma } = setup();
    await service.scheduleVisit(visit(at));
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    const [client, worker] = prisma.task.create.mock.calls.map(
      (c: any) => c[0].data,
    );
    expect(client).toMatchObject({
      userId: 'c1',
      dueAt: at,
      dedupeKey: 'tequio:r1:client',
      title: 'Tequio: llega Vulcanizadora El Rayo · Casa de mamá',
    });
    expect(worker).toMatchObject({
      userId: 'w1',
      title: 'Tequio: visita con Ana',
    });
    expect(client.reminder.create.remindAt.getTime()).toBe(
      at.getTime() - VISIT_REMINDER_MINUTES * 60_000,
    );
  });

  it('no agenda visitas pasadas y cierra los recordatorios al terminar o cancelar', async () => {
    const { service, prisma } = setup();
    await service.scheduleVisit(visit(new Date(Date.now() - 60_000)));
    expect(prisma.task.create).not.toHaveBeenCalled();
    await service.closeVisit('r1', 'cancelled');
    expect(prisma.task.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'cancelled',
      dedupeKey: null,
    });
    expect(prisma.taskReminder.updateMany.mock.calls[0][0].data.status).toBe(
      'cancelled',
    );
  });

  it('si ya existía, solo mueve la hora', async () => {
    const at = new Date(Date.now() + 2 * 3_600_000);
    const { service, prisma } = setup({ id: 't1' });
    await service.scheduleVisit(visit(at));
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).toHaveBeenCalledTimes(2);
    expect(prisma.taskReminder.upsert).toHaveBeenCalledTimes(2);
  });

  it('al cliente que debe una cancelación le recuerda cuánto y a quién', async () => {
    const remindAt = new Date(Date.now() + 86_400_000);
    const { service, prisma } = setup();
    await service.remindDebt({
      debtId: 'd1',
      clientUserId: 'c1',
      amountMxn: 90,
      workerName: 'Juan',
      remindAt,
    });
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({
      userId: 'c1',
      dedupeKey: 'tequio:adeudo:d1',
      title: 'Tequio: debes $90 a Juan por cancelar',
    });
    await service.closeDebt('d1');
    expect(prisma.task.updateMany.mock.calls[0][0].data.status).toBe(
      'completed',
    );
  });
});
