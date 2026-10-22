/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { arrivalPin } from './presente-job.domain';
import { PresenteJobsService } from './presente-jobs.service';

const auth = (id: string) => ({ user: { id, modules: ['all'] } }) as any;

const provider = {
  id: 'p1',
  userId: 'w1',
  displayName: 'Juan',
  status: 'VERIFIED',
};
const job = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  clientUserId: 'c1',
  status: 'ASSIGNED',
  urgency: 'NOW',
  trades: ['PLOMERIA'],
  lat: 19.7033,
  lng: -101.192,
  chosenQuoteId: 'q1',
  closedAt: new Date(Date.now() - 10 * 60_000),
  expiresAt: new Date(Date.now() + 3_600_000),
  enRouteAt: null,
  pinFailures: 0,
  pinLockedUntil: null,
  photoKey: null,
  reviews: [] as any[],
  quotes: [
    {
      id: 'q1',
      providerId: 'p1',
      status: 'ACCEPTED',
      amountMxn: 500,
      provider,
    },
  ],
  ...over,
});

function setup(req: any, extra: Record<string, any> = {}) {
  const prisma: any = {
    presenteRequest: {
      findUnique: jest.fn(async () => req),
      update: jest.fn(async (args: any) => ({ ...req, ...args.data })),
      updateMany: jest.fn(async () => ({ count: extra.closed ?? 1 })),
      findMany: jest.fn(async () => extra.due ?? []),
      count: jest.fn(async () => 0),
    },
    presenteQuote: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    presenteStrike: {
      create: jest.fn(),
      count: jest.fn(async () => extra.strikes ?? 1),
    },
    presenteProvider: {
      update: jest.fn(),
      findUnique: jest.fn(async () => provider),
    },
    presenteClient: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    presenteMessage: {
      create: jest.fn(),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => extra.tips ?? 0),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    presenteTrackPoint: {
      create: jest.fn(),
      findFirst: jest.fn(async () => extra.lastPoint ?? null),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    presenteReview: { create: jest.fn(), groupBy: jest.fn(async () => []) },
    presenteInvoice: { count: jest.fn(async () => extra.invoices ?? 0) },
    presenteCancelDebt: { findMany: jest.fn(async () => extra.debts ?? []) },
    presenteProviderPhoto: {
      count: jest.fn(async () => extra.photos ?? 0),
      create: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    presenteAuditEvent: { create: jest.fn() },
    site: {
      findFirst: jest.fn(async (args: any) =>
        args.where.id === 'mi-sitio' && args.where.companyId !== 'otra'
          ? { id: 'mi-sitio', name: 'Plomería Juan', slug: 'plomeria-juan' }
          : null,
      ),
      findMany: jest.fn(async () => [
        { id: 'mi-sitio', name: 'Plomería Juan', slug: 'plomeria-juan' },
      ]),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const storage: any = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
  const requests: any = {
    ratings: jest.fn(async () => new Map()),
    getMine: jest.fn(async () => ({ ok: true })),
    cancelFeeFor: jest.fn(
      async () => extra.fee ?? { amountMxn: 0, advancedKm: 0, why: 'NOT_LEFT' },
    ),
  };
  const wallet: any = { chargeCommission: jest.fn() };
  const reminders: any = {
    scheduleVisit: jest.fn(),
    closeVisit: jest.fn(),
    remindInvoice: jest.fn(),
  };
  const debts: any = {
    record: jest.fn(),
    release: jest.fn(),
    settleWithJob: jest.fn(),
    totalFor: jest.fn(async () => extra.debtMxn ?? 0),
    remindDue: jest.fn(),
  };
  const push: any = { notify: jest.fn(async () => 0), cleanup: jest.fn() };
  return {
    service: new PresenteJobsService(
      prisma,
      storage,
      requests,
      wallet,
      reminders,
      debts,
      push,
    ),
    debts,
    push,
    reminders,
    wallet,
    prisma,
    storage,
  };
}

describe('trabajo en curso', () => {
  it('puede avisar que hay tráfico hasta 2 veces; cada aviso mueve la hora y le avisa al cliente', async () => {
    const first = setup(job({ status: 'EN_ROUTE', delayCount: 0 }));
    await first.service.enRoute(auth('w1'), 'r1', 10, 'Hay tráfico');
    expect(
      first.prisma.presenteRequest.update.mock.calls[0][0].data,
    ).toMatchObject({ delayNote: 'Hay tráfico', delayCount: { increment: 1 } });
    const third = setup(job({ status: 'EN_ROUTE', delayCount: 2 }));
    await expect(
      third.service.enRoute(auth('w1'), 'r1', 10, 'Hay tráfico'),
    ).rejects.toThrow('Ya avisaste 2 veces');
  });

  it('solo el trabajador elegido mueve el trabajo', async () => {
    const { service } = setup(job());
    await expect(service.enRoute(auth('otro'), 'r1', 20)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('"voy en camino" fija la hora de llegada y avisa al cliente', async () => {
    const { service, prisma } = setup(job());
    await service.enRoute(auth('w1'), 'r1', 20);
    const data = prisma.presenteRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe('EN_ROUTE');
    expect(data.etaAt.getTime() - Date.now()).toBeGreaterThan(19 * 60_000);
    expect(prisma.presenteMessage.create.mock.calls[0][0].data.body).toContain(
      'va en camino',
    );
  });

  it('retrasarse actualiza la llegada con el motivo', async () => {
    const { service, prisma } = setup(
      job({ status: 'EN_ROUTE', enRouteAt: new Date() }),
    );
    await service.enRoute(auth('w1'), 'r1', 15, 'Mucho tráfico');
    expect(prisma.presenteRequest.update.mock.calls[0][0].data.delayNote).toBe(
      'Mucho tráfico',
    );
    expect(prisma.presenteMessage.create.mock.calls[0][0].data.body).toContain(
      'se retrasa',
    );
  });

  it('guarda el recorrido sin saturar (un punto cada 15 s)', async () => {
    const recent = setup(job({ status: 'EN_ROUTE' }), {
      lastPoint: { recordedAt: new Date() },
    });
    expect(
      await recent.service.location(auth('w1'), 'r1', 19.7, -101.19),
    ).toEqual({ saved: false });
    const old = setup(job({ status: 'EN_ROUTE' }), {
      lastPoint: { recordedAt: new Date(Date.now() - 60_000) },
    });
    expect(await old.service.location(auth('w1'), 'r1', 19.7, -101.19)).toEqual(
      { saved: true },
    );
  });

  it('llegada: PIN incorrecto cuenta intentos', async () => {
    const { service, prisma } = setup(job({ status: 'EN_ROUTE' }));
    await expect(service.arrive(auth('w1'), 'r1', '0000')).rejects.toThrow(
      BadRequestException,
    );
    expect(
      prisma.presenteRequest.update.mock.calls[0][0].data.pinFailures,
    ).toBe(1);
  });

  it('llegada: lejos del punto no se acepta', async () => {
    const { service } = setup(job({ status: 'EN_ROUTE' }));
    await expect(
      service.arrive(auth('w1'), 'r1', arrivalPin('r1'), {
        lat: 19.75,
        lng: -101.19,
      }),
    ).rejects.toThrow('aún no llegas');
  });

  it('llegada: con el PIN correcto y cerca, queda confirmada (la comisión es al cerrar)', async () => {
    const { service, prisma, wallet } = setup(job({ status: 'EN_ROUTE' }));
    await service.arrive(auth('w1'), 'r1', arrivalPin('r1'), {
      lat: 19.7034,
      lng: -101.192,
    });
    expect(prisma.presenteRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'ARRIVED',
    });
    expect(wallet.chargeCommission).not.toHaveBeenCalled();
  });

  it('empieza con duración estimada y termina', async () => {
    const started = setup(job({ status: 'ARRIVED' }));
    await started.service.start(auth('w1'), 'r1', 90);
    expect(
      started.prisma.presenteRequest.update.mock.calls[0][0].data,
    ).toMatchObject({
      status: 'IN_PROGRESS',
      estimatedMinutes: 90,
    });
    const working = setup(job({ status: 'IN_PROGRESS' }));
    await working.service.finish(auth('w1'), 'r1');
    expect(
      working.prisma.presenteRequest.update.mock.calls[0][0].data.status,
    ).toBe('COMPLETED');
    expect(working.reminders.closeVisit).toHaveBeenCalledWith(
      'r1',
      'completed',
    );
    const early = setup(job({ status: 'EN_ROUTE' }));
    await expect(early.service.finish(auth('w1'), 'r1')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('cierre del trabajo', () => {
  const done = (over: Record<string, unknown> = {}) =>
    job({
      status: 'COMPLETED',
      finishedAt: new Date(Date.now() - 3_600_000),
      finalAmountMxn: 650,
      clientConfirmedAt: null,
      problemAt: null,
      ...over,
    });

  it('al terminar guarda el precio real', async () => {
    const plumbing = setup(job({ status: 'IN_PROGRESS' }));
    await plumbing.service.finish(auth('w1'), 'r1', { finalAmountMxn: 650 });
    expect(
      plumbing.prisma.presenteRequest.update.mock.calls[0][0].data,
    ).toMatchObject({ status: 'COMPLETED', finalAmountMxn: 650 });
    const same = setup(job({ status: 'IN_PROGRESS' }));
    await same.service.finish(auth('w1'), 'r1');
    expect(
      same.prisma.presenteRequest.update.mock.calls[0][0].data.finalAmountMxn,
    ).toBe(500);
  });

  it('al terminar suma el adeudo de una cancelación anterior', async () => {
    const { service, prisma } = setup(job({ status: 'IN_PROGRESS' }), {
      debtMxn: 90,
    });
    await service.finish(auth('w1'), 'r1');
    expect(prisma.presenteMessage.create.mock.calls[0][0].data.body).toContain(
      'Más $90 de una cancelación anterior: en total $590',
    );
  });

  it('el cliente confirma: se cierra y se cobra sobre el precio final', async () => {
    const { service, wallet, debts } = setup(done());
    await service.confirmDone(auth('c1'), 'r1');
    expect(wallet.chargeCommission).toHaveBeenCalledWith('p1', 'r1', 650);
    // El adeudo que cobró se pasa al trabajador a quien se le debía.
    expect(debts.settleWithJob).toHaveBeenCalledWith('r1', 'p1');
    const other = setup(done());
    await expect(other.service.confirmDone(auth('w1'), 'r1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reportar un problema no cobra y avisa', async () => {
    const { service, prisma, wallet } = setup(done());
    await service.reportProblem(auth('c1'), 'r1', 'Sigue goteando la llave');
    expect(
      prisma.presenteRequest.update.mock.calls[0][0].data.problemNote,
    ).toBe('Sigue goteando la llave');
    expect(wallet.chargeCommission).not.toHaveBeenCalled();
  });

  it('a las 48 h sin respuesta se da por terminado', async () => {
    const { service, prisma, wallet } = setup(
      done({ finishedAt: new Date(Date.now() - 49 * 3_600_000) }),
      { due: [{ id: 'r1' }] },
    );
    await service.autoConfirm();
    expect(
      prisma.presenteRequest.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      status: 'COMPLETED',
      clientConfirmedAt: null,
      problemAt: null,
    });
    expect(
      prisma.presenteRequest.updateMany.mock.calls[0][0].data.autoConfirmed,
    ).toBe(true);
    expect(wallet.chargeCommission).toHaveBeenCalled();
  });

  it('si ya estaba cerrado no cobra dos veces', async () => {
    const { service, wallet } = setup(done(), { closed: 0 });
    await service.confirmDone(auth('c1'), 'r1');
    expect(wallet.chargeCommission).not.toHaveBeenCalled();
  });
});

describe('cancelaciones', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('el trabajador cancela: falta, y el pedido vuelve a abrirse', async () => {
    const { service, prisma } = setup(job({ status: 'EN_ROUTE' }));
    const result = await service.workerCancel(
      auth('w1'),
      'r1',
      'Se me ponchó la llanta',
    );
    expect(prisma.presenteStrike.create).toHaveBeenCalled();
    expect(prisma.presenteRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'OPEN',
      chosenQuoteId: null,
    });
    expect(result.suspendedUntil).toBeNull();
  });

  it('con más de 5 faltas en el mes queda de baja un mes', async () => {
    const { service, prisma } = setup(job(), { strikes: 6 });
    const result = await service.workerCancel(auth('w1'), 'r1');
    expect(result.suspendedUntil).not.toBeNull();
    expect(prisma.presenteProvider.update.mock.calls[0][0].data.presence).toBe(
      'ABSENT',
    );
  });

  it('el cliente cancela con el trabajador en camino: cuota por km y queda como adeudo', async () => {
    const { service, prisma, reminders, debts } = setup(
      job({ status: 'EN_ROUTE' }),
      { fee: { amountMxn: 90, advancedKm: 6, why: 'ON_THE_WAY' } },
    );
    await service.clientCancel(auth('c1'), 'r1');
    expect(reminders.closeVisit).toHaveBeenCalledWith('r1', 'cancelled');
    expect(prisma.presenteRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'CLIENT',
      cancelFeeMxn: 90,
    });
    expect(debts.record).toHaveBeenCalledWith({
      clientUserId: 'c1',
      requestId: 'r1',
      providerId: 'p1',
      workerName: 'Juan',
      amountMxn: 90,
      advancedKm: 6,
    });
    expect(prisma.presenteMessage.create.mock.calls[0][0].data.body).toContain(
      'Se suma al siguiente pedido del cliente',
    );
  });

  it('sin cuota (no había salido) no deja adeudo', async () => {
    const { service, prisma, debts } = setup(job({ status: 'ASSIGNED' }));
    await service.clientCancel(auth('c1'), 'r1');
    expect(
      prisma.presenteRequest.update.mock.calls[0][0].data.cancelFeeMxn,
    ).toBeNull();
    expect(debts.record).not.toHaveBeenCalled();
    // Si este pedido traía un adeudo anterior, queda para el siguiente.
    expect(debts.release).toHaveBeenCalledWith('r1');
  });

  it('nadie más puede cancelar el pedido de otro', async () => {
    const { service } = setup(job());
    await expect(service.clientCancel(auth('intruso'), 'r1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('mensajes y estrellas', () => {
  it('solo cliente y trabajador elegido escriben', async () => {
    const { service, prisma } = setup(job());
    await expect(
      service.sendMessage(auth('intruso'), 'r1', 'hola'),
    ).rejects.toThrow(NotFoundException);
    await service.sendMessage(auth('c1'), 'r1', ' ¿Ya vienes? ');
    expect(prisma.presenteMessage.create.mock.calls[0][0].data).toMatchObject({
      senderRole: 'CLIENT',
      body: '¿Ya vienes?',
    });
  });

  it('se califica una vez y al terminar, de los dos lados', async () => {
    const early = setup(job({ status: 'IN_PROGRESS' }));
    await expect(
      early.service.review(auth('c1'), 'r1', { stars: 5 }),
    ).rejects.toThrow(ConflictException);
    const done = setup(job({ status: 'COMPLETED' }));
    await done.service.review(auth('c1'), 'r1', {
      stars: 5,
      comment: 'Muy bien',
    });
    expect(
      done.prisma.presenteReview.create.mock.calls[0][0].data,
    ).toMatchObject({
      toUserId: 'w1',
      toRole: 'WORKER',
      stars: 5,
    });
    await done.service.review(auth('w1'), 'r1', { stars: 4 });
    expect(
      done.prisma.presenteReview.create.mock.calls[1][0].data,
    ).toMatchObject({
      toUserId: 'c1',
      toRole: 'CLIENT',
    });
    const twice = setup(
      job({ status: 'COMPLETED', reviews: [{ fromUserId: 'c1' }] }),
    );
    await expect(
      twice.service.review(auth('c1'), 'r1', { stars: 3 }),
    ).rejects.toThrow('Ya calificaste');
  });

  it('con factura pedida, el cliente califica cuando llega o a los 3 días', async () => {
    const finishedAt = new Date(Date.now() - 86_400_000);
    const waiting = setup(
      job({ status: 'COMPLETED', needsInvoice: true, finishedAt }),
    );
    await expect(
      waiting.service.review(auth('c1'), 'r1', { stars: 5 }),
    ).rejects.toThrow('Califica cuando te llegue tu factura');
    // El trabajador sí puede calificar al cliente desde que termina.
    await waiting.service.review(auth('w1'), 'r1', { stars: 5 });
    expect(
      waiting.prisma.presenteReview.create.mock.calls[0][0].data,
    ).toMatchObject({ toRole: 'CLIENT', invoiceMissing: false });

    const arrived = setup(
      job({ status: 'COMPLETED', needsInvoice: true, finishedAt }),
      { invoices: 1 },
    );
    await arrived.service.review(auth('c1'), 'r1', { stars: 5 });
    expect(
      arrived.prisma.presenteReview.create.mock.calls[0][0].data,
    ).toMatchObject({ toRole: 'WORKER', invoiceMissing: false });

    const late = setup(
      job({
        status: 'COMPLETED',
        needsInvoice: true,
        finishedAt: new Date(Date.now() - 4 * 86_400_000),
      }),
    );
    await late.service.review(auth('c1'), 'r1', { stars: 2 });
    expect(
      late.prisma.presenteReview.create.mock.calls[0][0].data,
    ).toMatchObject({ toRole: 'WORKER', invoiceMissing: true });
  });
});

describe('fotos del trabajador y limpieza', () => {
  it('hasta 9 fotos', async () => {
    const { service } = setup(job(), { photos: 9 });
    await expect(
      service.addPhoto(auth('w1'), {
        kind: 'WORK',
        dataUrl: 'data:image/jpeg;base64,AAAA',
      }),
    ).rejects.toThrow('hasta 9');
  });
});

describe('seguir usando Presente', () => {
  it('si comparten teléfono, se recuerda una sola vez por qué conviene seguir aquí', async () => {
    const first = setup(job());
    await first.service.sendMessage(auth('w1'), 'r1', 'Mi cel es 443 123 4567');
    expect(first.prisma.presenteMessage.create.mock.calls[1][0].data.kind).toBe(
      'TIP',
    );
    const again = setup(job(), { tips: 1 });
    await again.service.sendMessage(auth('w1'), 'r1', 'Otro: 443 765 4321');
    expect(again.prisma.presenteMessage.create).toHaveBeenCalledTimes(1);
  });

  it('el trabajador propone la siguiente visita al terminar', async () => {
    const { service, prisma } = setup(job({ status: 'COMPLETED' }));
    const when = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await service.proposeFollowUp(auth('w1'), 'r1', when, 'Revisión');
    const data = prisma.presenteMessage.create.mock.calls[0][0].data;
    expect(data.kind).toBe('FOLLOW_UP');
    expect(data.meta).toMatchObject({ scheduledFor: when, providerId: 'p1' });
    const early = setup(job({ status: 'EN_ROUTE' }));
    await expect(
      early.service.proposeFollowUp(auth('w1'), 'r1', when),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.proposeFollowUp(
        auth('w1'),
        'r1',
        new Date(Date.now() + 60_000).toISOString(),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('página web del trabajador', () => {
  it('solo puede elegir una página publicada de su negocio', async () => {
    const { service, prisma } = setup(job());
    const mine = {
      user: { id: 'w1', companyId: 'c-w1', modules: ['all'] },
    } as any;
    await service.setSite(mine, 'mi-sitio');
    expect(prisma.presenteProvider.update.mock.calls[0][0].data).toEqual({
      siteId: 'mi-sitio',
    });
    await expect(service.setSite(mine, 'ajena')).rejects.toThrow(
      'no es de tu negocio',
    );
    await service.setSite(mine, null);
    expect(prisma.presenteProvider.update.mock.calls[1][0].data).toEqual({
      siteId: null,
    });
  });
});
