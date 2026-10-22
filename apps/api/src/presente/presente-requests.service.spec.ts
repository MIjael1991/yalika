/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { PresentePlacesService } from './presente-places.service';
import { PresenteRequestsService } from './presente-requests.service';

const auth = (id: string) => ({ user: { id, modules: ['all'] } }) as any;
const soon = () => new Date(Date.now() + 3_600_000);

const worker = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'w1',
  displayName: 'Juan',
  bio: null,
  trades: ['PLOMERIA'],
  municipalityCode: '16053',
  radiusKm: 20,
  availability: null,
  status: 'VERIFIED',
  presence: 'PRESENT',
  lastSeenAt: new Date(),
  suspendedUntil: null,
  ...over,
});

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  clientUserId: 'c1',
  trades: ['PLOMERIA'],
  description: 'Se rompió la llave del lavabo',
  municipalityCode: '16053',
  addressHint: 'Calle Falsa 123',
  lat: 19.7,
  lng: -101.19,
  urgency: 'NOW',
  status: 'OPEN',
  photoKey: null,
  photoMime: null,
  chosenQuoteId: null,
  expiresAt: soon(),
  closedAt: null,
  createdAt: new Date(),
  quotes: [] as any[],
  reviews: [] as any[],
  ...over,
});

function setup(
  opts: {
    req?: any;
    provider?: any;
    providers?: any[];
    openCount?: number;
    client?: any;
    favorites?: any[];
    place?: any;
    debtMxn?: number;
    approvedCredentials?: number;
  } = {},
) {
  const prisma: any = {
    presenteRequest: {
      count: jest.fn(async () => opts.openCount ?? 0),
      create: jest.fn(async (args: any) => ({ ...request(), ...args.data })),
      findUnique: jest.fn(async () => opts.req ?? null),
      findMany: jest.fn(async () => (opts.req ? [opts.req] : [])),
      update: jest.fn(async (args: any) => ({ ...opts.req, ...args.data })),
    },
    presenteDocument: { count: jest.fn(async () => 0) },
    presenteQuote: {
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    presenteProvider: {
      findUnique: jest.fn(async () => opts.provider ?? null),
      findMany: jest.fn(async () => opts.providers ?? []),
    },
    presenteClient: {
      findUnique: jest.fn(async () =>
        opts.client === undefined ? { displayName: 'Ana' } : opts.client,
      ),
    },
    presentePlace: {
      findUnique: jest.fn(async () => opts.place ?? null),
    },
    presenteReview: { groupBy: jest.fn(async () => []) },
    presenteFavorite: {
      findMany: jest.fn(async () => opts.favorites ?? []),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    presenteTrackPoint: { findFirst: jest.fn(async () => null) },
    presenteCredential: {
      count: jest.fn(async () => opts.approvedCredentials ?? 0),
    },
    presenteMessage: { create: jest.fn() },
    presenteAuditEvent: { create: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const storage: any = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
  const wallet: any = { requireBalance: jest.fn() };
  const reminders: any = { scheduleVisit: jest.fn(), closeVisit: jest.fn() };
  const debts: any = {
    attach: jest.fn(async () => opts.debtMxn ?? 0),
    totalFor: jest.fn(async () => opts.debtMxn ?? 0),
  };
  const push: any = { notify: jest.fn(async () => 0), cleanup: jest.fn() };
  const invoices: any = {
    snapshot: jest.fn(async () => ({
      rfc: 'LOAA800101AB1',
      name: 'ANA LOPEZ',
      regime: '612',
      zip: '58000',
      use: 'G03',
      email: null,
    })),
    forRequest: jest.fn(async () => null),
  };
  return {
    service: new PresenteRequestsService(
      prisma,
      storage,
      wallet,
      new PresentePlacesService(prisma, storage),
      reminders,
      debts,
      push,
      invoices,
    ),
    invoices,
    debts,
    push,
    reminders,
    wallet,
    prisma,
    storage,
  };
}

const newRequest = {
  trades: ['PLOMERIA', 'PLOMERIA', 'ELECTRICIDAD'],
  description: 'Se rompió la llave del lavabo',
  municipalityCode: '16053',
  addressHint: 'Calle Falsa 123',
  lat: 19.7,
  lng: -101.19,
  urgency: 'NOW',
};

describe('PresenteRequestsService · cliente', () => {
  it('crea el pedido con varios oficios, punto exacto y vencimiento', async () => {
    const { service, prisma } = setup({
      providers: [
        worker(),
        worker({ id: 'p2', userId: 'w2', municipalityCode: '16102' }),
      ],
    });
    const view = await service.create(auth('c1'), newRequest);
    const data = prisma.presenteRequest.create.mock.calls[0][0].data;
    expect(data.trades).toEqual(['PLOMERIA', 'ELECTRICIDAD']);
    expect(data.lat).toBe(19.7);
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      5.9 * 3_600_000,
    );
    expect(view.nearbyPresent).toBe(1);
  });

  it('con un lugar guardado toma su punto, municipio y dirección (no se captura otra vez)', async () => {
    const place = {
      id: '8f0c1a52-2b7e-4f3a-9d10-1c2b3a4d5e6f',
      clientUserId: 'c1',
      label: 'Casa de mamá',
      street: 'Av. Madero',
      number: '120',
      neighborhood: 'Centro',
      municipalityCode: '16053',
      lat: 19.7,
      lng: -101.18,
      reference: 'Portón café',
      photoKey: null,
      photoMime: null,
    };
    const { service, prisma } = setup({ place });
    await service.create(auth('c1'), {
      trades: ['LLANTAS'],
      description: 'Se ponchó la llanta del carro',
      urgency: 'NOW',
      placeId: place.id,
    });
    const data = prisma.presenteRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      placeId: place.id,
      placeLabel: 'Casa de mamá',
      municipalityCode: '16053',
      lat: 19.7,
      lng: -101.18,
      addressHint: 'Av. Madero 120, col. Centro · Portón café',
    });
  });

  it('no deja usar el lugar de otra persona ni uno sin calle', async () => {
    const base = {
      id: '8f0c1a52-2b7e-4f3a-9d10-1c2b3a4d5e6f',
      label: 'Casa',
      street: 'Juárez',
      number: null,
      neighborhood: null,
      municipalityCode: '16053',
      lat: 19.7,
      lng: -101.18,
      reference: null,
    };
    const input = {
      trades: ['PLOMERIA'],
      description: 'Fuga en el baño',
      urgency: 'NOW',
      placeId: base.id,
    };
    const other = setup({ place: { ...base, clientUserId: 'otra' } });
    await expect(other.service.create(auth('c1'), input)).rejects.toThrow(
      NotFoundException,
    );
    const empty = setup({ place: { ...base, clientUserId: 'c1', street: '' } });
    await expect(empty.service.create(auth('c1'), input)).rejects.toThrow(
      'calle',
    );
  });

  it('guarda hasta 5 fotos del problema y no más', async () => {
    const bytes = Buffer.alloc(20_000, 0x11);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const jpeg = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    const { service, prisma, storage } = setup();
    const view = await service.create(auth('c1'), {
      ...newRequest,
      photoDataUrls: [jpeg, jpeg, jpeg, jpeg, jpeg],
    });
    const data = prisma.presenteRequest.create.mock.calls[0][0].data;
    expect(storage.put).toHaveBeenCalledTimes(5);
    expect(data.photoKey).toMatch(/^private\/presente\/requests\//);
    expect(data.extraPhotos).toHaveLength(4);
    expect(view.photoCount).toBe(5);
    await expect(
      service.create(auth('c1'), {
        ...newRequest,
        photoDataUrl: jpeg,
        photoDataUrls: [jpeg, jpeg, jpeg, jpeg, jpeg],
      }),
    ).rejects.toThrow('hasta 5');
  });

  it('las fotos también se agregan una por una al pedido abierto (sin pasar de 5)', async () => {
    const bytes = Buffer.alloc(20_000, 0x11);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const jpeg = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    const first = setup({ req: request() });
    await first.service.addPhoto(auth('c1'), 'r1', jpeg);
    expect(
      first.prisma.presenteRequest.update.mock.calls[0][0].data,
    ).toMatchObject({
      photoMime: 'image/jpeg',
    });
    const second = setup({
      req: request({
        photoKey: 'a',
        photoMime: 'image/jpeg',
        extraPhotos: [{ key: 'b', mime: 'image/jpeg' }],
      }),
    });
    const result = await second.service.addPhoto(auth('c1'), 'r1', jpeg);
    expect(result.photoCount).toBe(3);
    expect(
      second.prisma.presenteRequest.update.mock.calls[0][0].data.extraPhotos,
    ).toHaveLength(2);
    const full = setup({
      req: request({
        photoKey: 'a',
        photoMime: 'image/jpeg',
        extraPhotos: [1, 2, 3, 4].map((n) => ({
          key: `k${n}`,
          mime: 'image/jpeg',
        })),
      }),
    });
    await expect(full.service.addPhoto(auth('c1'), 'r1', jpeg)).rejects.toThrow(
      'hasta 5',
    );
    await expect(
      first.service.addPhoto(auth('intruso'), 'r1', jpeg),
    ).rejects.toThrow(NotFoundException);
  });

  it('mis pedidos dicen cómo va: a qué hora llega y quién va, sin datos de la casa', async () => {
    const chosenAt = new Date('2026-10-21T15:00:00Z');
    const assigned = request({
      status: 'ASSIGNED',
      chosenQuoteId: 'q1',
      placeLabel: 'Casa de mamá',
      quotes: [
        {
          id: 'q1',
          status: 'ACCEPTED',
          etaMinutes: 10,
          updatedAt: chosenAt,
          provider: {
            displayName: 'Juan',
            businessName: 'Vulcanizadora El Rayo',
          },
        },
      ],
    });
    const { service } = setup({ req: assigned });
    const [item] = await service.listMine(auth('c1'));
    expect(item).toMatchObject({
      status: 'ASSIGNED',
      placeLabel: 'Casa de mamá',
      providerName: 'Vulcanizadora El Rayo',
    });
    expect(item.arriveBy?.toISOString()).toBe('2026-10-21T15:10:00.000Z');
    expect(item).not.toHaveProperty('addressHint');
    expect(item).not.toHaveProperty('lat');

    const etaAt = new Date('2026-10-21T15:25:00Z');
    const onTheWay = setup({ req: { ...assigned, status: 'EN_ROUTE', etaAt } });
    const [moving] = await onTheWay.service.listMine(auth('c1'));
    expect(moving.arriveBy).toEqual(etaAt);
  });

  it('pide completar los datos antes del primer pedido', async () => {
    const { service } = setup({ client: null });
    await expect(service.create(auth('c1'), newRequest)).rejects.toThrow(
      'datos',
    );
  });

  it('rechaza servicios aún sin verificación, municipios inválidos y más de 3 pedidos en curso', async () => {
    const { service } = setup();
    await expect(
      service.create(auth('c1'), {
        ...newRequest,
        trades: ['TRASLADO_AMBULANCIA'],
      }),
    ).rejects.toThrow('disponible');
    await expect(
      service.create(auth('c1'), { ...newRequest, municipalityCode: '99999' }),
    ).rejects.toThrow('municipio');
    const busy = setup({ openCount: 3 });
    await expect(busy.service.create(auth('c1'), newRequest)).rejects.toThrow(
      ConflictException,
    );
  });

  it('otro usuario no puede ver ni elegir en un pedido ajeno', async () => {
    const { service } = setup({ req: request() });
    await expect(service.getMine(auth('intruso'), 'r1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.choose(auth('intruso'), 'r1', 'q1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('elegir acepta un presupuesto, rechaza los demás y abre los mensajes', async () => {
    const quotes = [
      {
        id: 'q1',
        providerId: 'p1',
        status: 'SENT',
        amountMxn: 500,
        etaMinutes: 30,
        durationMinutes: 60,
        provider: worker(),
      },
      {
        id: 'q2',
        providerId: 'p2',
        status: 'SENT',
        amountMxn: 400,
        etaMinutes: 60,
        durationMinutes: 60,
        provider: worker({ id: 'p2' }),
      },
    ];
    const { service, prisma } = setup({ req: request({ quotes }) });
    await service.choose(auth('c1'), 'r1', 'q1');
    expect(prisma.presenteRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'ASSIGNED',
      chosenQuoteId: 'q1',
    });
    expect(prisma.presenteQuote.updateMany.mock.calls[0][0]).toMatchObject({
      data: { status: 'DECLINED' },
    });
    expect(prisma.presenteMessage.create).toHaveBeenCalled();
  });

  it('al elegir, lo que debía de una cancelación se suma a este pedido', async () => {
    const quotes = [
      {
        id: 'q1',
        providerId: 'p1',
        status: 'SENT',
        amountMxn: 500,
        etaMinutes: 30,
        durationMinutes: 60,
        provider: worker(),
      },
    ];
    const { service, prisma, debts } = setup({
      req: request({ quotes }),
      debtMxn: 90,
    });
    await service.choose(auth('c1'), 'r1', 'q1');
    expect(debts.attach).toHaveBeenCalledWith('c1', 'r1');
    const bodies = prisma.presenteMessage.create.mock.calls.map(
      (c: any) => c[0].data.body,
    );
    expect(bodies.join(' ')).toContain(
      'se suman $90 de una cancelación anterior',
    );
  });

  it('elegir en una visita agendada deja el recordatorio a los dos', async () => {
    const scheduledFor = new Date(Date.now() + 26 * 3_600_000);
    const quotes = [
      {
        id: 'q1',
        providerId: 'p1',
        status: 'SENT',
        amountMxn: 500,
        etaMinutes: 30,
        durationMinutes: 60,
        provider: worker(),
      },
    ];
    const { service, reminders } = setup({
      req: request({ quotes, scheduledFor, placeLabel: 'Oficina' }),
    });
    await service.choose(auth('c1'), 'r1', 'q1');
    expect(reminders.scheduleVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'r1',
        scheduledFor,
        clientUserId: 'c1',
        workerUserId: 'w1',
        clientName: 'Ana',
        placeLabel: 'Oficina',
      }),
    );
    const now = setup({ req: request({ quotes }) });
    await now.service.choose(auth('c1'), 'r1', 'q1');
    expect(now.reminders.scheduleVisit).not.toHaveBeenCalled();
  });

  it('cita: el trabajador propone otra hora en su horario; al elegirlo queda esa', async () => {
    const asked = new Date(Date.now() + 26 * 3_600_000);
    const other = new Date(asked.getTime() + 24 * 3_600_000);
    const always = {
      days: [1, 2, 3, 4, 5, 6, 7],
      allDay: true,
      from: null,
      to: null,
    };
    const quoting = setup({
      provider: worker({ availability: always }),
      req: request({ scheduledFor: asked }),
    });
    await quoting.service.sendQuote(auth('w1'), 'r1', {
      amountMxn: 400,
      etaMinutes: 30,
      durationMinutes: 60,
      proposedFor: other.toISOString(),
    });
    expect(
      quoting.prisma.presenteQuote.upsert.mock.calls[0][0].create.proposedFor,
    ).toEqual(other);
    expect(quoting.push.notify).toHaveBeenCalledWith(
      ['c1'],
      expect.objectContaining({
        title: expect.stringContaining('te propone otra hora'),
      }),
    );
    const outside = setup({
      provider: worker({ availability: { ...always, days: [] } }),
      req: request({ scheduledFor: asked }),
    });
    await expect(
      outside.service.sendQuote(auth('w1'), 'r1', {
        amountMxn: 400,
        etaMinutes: 30,
        durationMinutes: 60,
        proposedFor: other.toISOString(),
      }),
    ).rejects.toThrow('fuera de tu horario');
    const noDate = setup({
      provider: worker({ availability: always }),
      req: request(),
    });
    await expect(
      noDate.service.sendQuote(auth('w1'), 'r1', {
        amountMxn: 400,
        etaMinutes: 30,
        durationMinutes: 60,
        proposedFor: other.toISOString(),
      }),
    ).rejects.toThrow('Solo en las citas');

    const quotes = [
      {
        id: 'q1',
        providerId: 'p1',
        status: 'SENT',
        amountMxn: 500,
        etaMinutes: 30,
        durationMinutes: 60,
        proposedFor: other,
        provider: worker(),
      },
    ];
    const choosing = setup({ req: request({ quotes, scheduledFor: asked }) });
    await choosing.service.choose(auth('c1'), 'r1', 'q1');
    expect(
      choosing.prisma.presenteRequest.update.mock.calls[0][0].data,
    ).toMatchObject({ scheduledFor: other, etaAt: other });
    expect(choosing.reminders.scheduleVisit).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledFor: other }),
    );
  });

  it('el cliente ve el PIN y el punto cuando ya eligió; nunca ve otros presupuestos', async () => {
    const quotes = [
      {
        id: 'q1',
        providerId: 'p1',
        status: 'ACCEPTED',
        amountMxn: 500,
        etaMinutes: 30,
        durationMinutes: 60,
        provider: worker(),
      },
      {
        id: 'q2',
        providerId: 'p2',
        status: 'DECLINED',
        amountMxn: 400,
        etaMinutes: 60,
        durationMinutes: 60,
        provider: worker({ id: 'p2' }),
      },
    ];
    const { service } = setup({
      req: request({ quotes, status: 'ASSIGNED', chosenQuoteId: 'q1' }),
    });
    const view = await service.getMine(auth('c1'), 'r1');
    expect(view.job?.pin).toMatch(/^\d{4}$/);
    expect(view.quotes).toEqual([]);
  });

  it('no se elige en un pedido vencido', async () => {
    const { service } = setup({
      req: request({ expiresAt: new Date(Date.now() - 1000) }),
    });
    await expect(service.choose(auth('c1'), 'r1', 'q1')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('PresenteRequestsService · salud', () => {
  it('se puede pedir médico a domicilio', async () => {
    const { service, prisma } = setup();
    await service.create(auth('c1'), { ...newRequest, trades: ['MEDICO'] });
    expect(prisma.presenteRequest.create.mock.calls[0][0].data.trades).toEqual([
      'MEDICO',
    ]);
  });

  it('un médico sin cédula vigente en Salud no puede cotizar', async () => {
    const doctor = worker({ trades: ['MEDICO'] });
    const req = request({ trades: ['MEDICO'] });
    const revoked = setup({ provider: doctor, req });
    revoked.prisma.clinicalProfessionalProfile = {
      findUnique: jest.fn(async () => ({
        profession: 'Médico',
        verificationStatus: 'REVOKED',
        active: true,
      })),
    };
    await expect(
      revoked.service.sendQuote(auth('w1'), 'r1', {
        amountMxn: 600,
        etaMinutes: 30,
        durationMinutes: 40,
      }),
    ).rejects.toThrow('cédula');
    const ok = setup({ provider: doctor, req });
    ok.prisma.clinicalProfessionalProfile = {
      findUnique: jest.fn(async () => ({
        profession: 'Médico',
        verificationStatus: 'VERIFIED',
        active: true,
      })),
    };
    await ok.service.sendQuote(auth('w1'), 'r1', {
      amountMxn: 600,
      etaMinutes: 30,
      durationMinutes: 40,
    });
    expect(ok.prisma.presenteQuote.upsert).toHaveBeenCalled();
  });

  it('quien pide factura solo recibe precios de quienes facturan', async () => {
    const quote = { amountMxn: 500, etaMinutes: 20, durationMinutes: 30 };
    const no = setup({
      provider: worker(),
      req: request({ needsInvoice: true }),
    });
    expect((await no.service.nearby(auth('w1'))).requests).toEqual([]);
    await expect(no.service.sendQuote(auth('w1'), 'r1', quote)).rejects.toThrow(
      ConflictException,
    );
    const yes = setup({
      provider: worker({ invoices: true }),
      req: request({ needsInvoice: true }),
    });
    const near = await yes.service.nearby(auth('w1'));
    expect(near.requests[0]).toMatchObject({ needsInvoice: true });
    await yes.service.sendQuote(auth('w1'), 'r1', quote);
    expect(yes.prisma.presenteQuote.upsert).toHaveBeenCalled();
  });

  it('el aviso de pedido nuevo solo llega a quien está prendido', async () => {
    const on = worker({ id: 'p1', userId: 'w1' });
    const off = worker({ id: 'p2', userId: 'w2', presence: 'ABSENT' });
    const { service, push } = setup({ providers: [on, off] });
    (service as any).announce(request(), new Date());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(push.notify).toHaveBeenCalledWith(['w1'], expect.anything());
    // Pedido directo a alguien apagado: no se le avisa (lo ve al entrar).
    const direct = setup({ providers: [off] });
    direct.prisma.presenteProvider.findMany = jest.fn(async () => [off]);
    (direct.service as any).announce(
      request({ targetProviderId: 'p2' }),
      new Date(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(direct.push.notify).toHaveBeenCalledWith([], expect.anything());
  });

  it('un médico con su cédula aprobada en Tequio sí cotiza, aunque no esté en Salud', async () => {
    const doctor = worker({ trades: ['MEDICO'] });
    const req = request({ trades: ['MEDICO'] });
    const viaTequio = setup({ provider: doctor, req, approvedCredentials: 1 });
    viaTequio.prisma.clinicalProfessionalProfile = {
      findUnique: jest.fn(async () => null),
    };
    await viaTequio.service.sendQuote(auth('w1'), 'r1', {
      amountMxn: 600,
      etaMinutes: 30,
      durationMinutes: 40,
    });
    expect(viaTequio.prisma.presenteQuote.upsert).toHaveBeenCalled();
    // Y al cliente le llega el aviso del presupuesto.
    expect(viaTequio.push.notify).toHaveBeenCalledWith(
      ['c1'],
      expect.objectContaining({ url: '/tequio/pedido/r1' }),
    );
  });
});

describe('PresenteRequestsService · trabajador', () => {
  it('ve pedidos cercanos sin la referencia ni el punto exacto', async () => {
    const { service } = setup({ provider: worker(), req: request() });
    const result = await service.nearby(auth('w1'));
    expect(result.present).toBe(true);
    expect(result.requests).toHaveLength(1);
    const text = JSON.stringify(result);
    expect(text).not.toContain('Calle Falsa');
    expect(text).not.toContain('19.7');
  });

  it('apagado (Ausente) también ve los trabajos y puede mandar su precio', async () => {
    const off = setup({
      provider: worker({ presence: 'ABSENT' }),
      req: request(),
    });
    const absent = await off.service.nearby(auth('w1'));
    expect(absent.present).toBe(false);
    expect(absent.requests).toHaveLength(1);
    expect(absent.waiting).toEqual({ count: 1, trades: ['PLOMERIA'] });
    await off.service.sendQuote(auth('w1'), 'r1', {
      amountMxn: 400,
      etaMinutes: 30,
      durationMinutes: 60,
    });
    expect(off.prisma.presenteQuote.upsert).toHaveBeenCalled();
  });

  it('de baja temporal no ve ni cotiza; con la revalidación vencida no cotiza', async () => {
    const until = new Date(Date.now() + 86_400_000);
    const suspended = setup({
      provider: worker({ suspendedUntil: until, presence: 'ABSENT' }),
      req: request(),
    });
    const result = await suspended.service.nearby(auth('w1'));
    expect(result.present).toBe(false);
    expect(result.requests).toEqual([]);
    expect(result.suspendedUntil).toEqual(until);
    await expect(
      suspended.service.sendQuote(auth('w1'), 'r1', {
        amountMxn: 400,
        etaMinutes: 30,
        durationMinutes: 60,
      }),
    ).rejects.toThrow(ConflictException);
    const old = new Date(Date.now() - 120 * 86_400_000);
    const overdue = setup({
      provider: worker({ identityCheckedAt: old, reviewedAt: old }),
      req: request(),
    });
    await expect(
      overdue.service.sendQuote(auth('w1'), 'r1', {
        amountMxn: 400,
        etaMinutes: 30,
        durationMinutes: 60,
      }),
    ).rejects.toThrow('revalidar');
  });

  it('sin verificar no cotiza', async () => {
    const { service } = setup({
      provider: worker({ status: 'PENDING_REVIEW' }),
      req: request(),
    });
    await expect(
      service.sendQuote(auth('w1'), 'r1', {
        amountMxn: 300,
        etaMinutes: 20,
        durationMinutes: 30,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('no cotiza fuera de su rango ni su propio pedido', async () => {
    const quote = { amountMxn: 300, etaMinutes: 20, durationMinutes: 30 };
    const far = setup({
      provider: worker(),
      req: request({ municipalityCode: '16102' }),
    });
    await expect(
      far.service.sendQuote(auth('w1'), 'r1', quote),
    ).rejects.toThrow(ConflictException);
    const own = setup({
      provider: worker(),
      req: request({ clientUserId: 'w1' }),
    });
    await expect(
      own.service.sendQuote(auth('w1'), 'r1', quote),
    ).rejects.toThrow(ConflictException);
  });

  it('cotiza con precio, llegada y duración del trabajo', async () => {
    const { service, prisma, wallet } = setup({
      provider: worker(),
      req: request(),
    });
    await service.sendQuote(auth('w1'), 'r1', {
      amountMxn: 350,
      etaMinutes: 25,
      durationMinutes: 90,
      note: ' Llevo refacción ',
    });
    expect(prisma.presenteQuote.upsert.mock.calls[0][0].create).toMatchObject({
      amountMxn: 350,
      etaMinutes: 25,
      durationMinutes: 90,
      note: 'Llevo refacción',
    });
    expect(wallet.requireBalance).toHaveBeenCalled();
  });

  it('la foto del pedido solo la ve el dueño o quien puede atender', async () => {
    const withPhoto = request({ photoKey: 'k', photoMime: 'image/jpeg' });
    const stranger = setup({
      req: withPhoto,
      provider: worker({ trades: ['GRUA'] }),
    });
    await expect(stranger.service.photo(auth('w1'), 'r1')).rejects.toThrow(
      NotFoundException,
    );
    const ok = setup({ req: withPhoto, provider: worker() });
    ok.storage.get.mockResolvedValue(Buffer.from('foto'));
    await expect(ok.service.photo(auth('w1'), 'r1')).resolves.toMatchObject({
      dataUrl: expect.stringContaining('image/jpeg'),
    });
  });
});

describe('PresenteRequestsService · trabajadores de confianza y pedidos directos', () => {
  // Martes 20 de octubre de 2026, 10:00 hora de México (16:00 UTC).
  const tuesdayTen = '2026-10-20T16:00:00.000Z';
  const sundayTen = '2026-10-25T16:00:00.000Z';
  const weekdays = {
    days: [1, 2, 3, 4, 5],
    allDay: false,
    from: '08:00',
    to: '20:00',
  };

  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-19T14:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('pide directo a un trabajador de confianza, agendado en su horario', async () => {
    const { service, prisma } = setup({
      provider: worker({ availability: weekdays }),
    });
    const view = await service.create(auth('c1'), {
      ...newRequest,
      trades: ['PLOMERIA'],
      providerId: 'p1',
      scheduledFor: tuesdayTen,
    });
    const data = prisma.presenteRequest.create.mock.calls[0][0].data;
    expect(data.targetProviderId).toBe('p1');
    expect(data.scheduledFor.toISOString()).toBe(tuesdayTen);
    expect(data.expiresAt.toISOString()).toBe(tuesdayTen);
    expect(view.nearbyPresent).toBe(1);
  });

  it('no deja agendar fuera del horario del trabajador ni pedirle lo que no hace', async () => {
    const { service } = setup({ provider: worker({ availability: weekdays }) });
    await expect(
      service.create(auth('c1'), {
        ...newRequest,
        trades: ['PLOMERIA'],
        providerId: 'p1',
        scheduledFor: sundayTen,
      }),
    ).rejects.toThrow('no atiende');
    await expect(
      service.create(auth('c1'), {
        ...newRequest,
        trades: ['ELECTRICIDAD'],
        providerId: 'p1',
      }),
    ).rejects.toThrow('no ofrece');
  });

  it('el pedido directo solo lo ve ese trabajador, aunque esté Ausente o lejos', async () => {
    const directed = request({
      targetProviderId: 'p1',
      municipalityCode: '16102',
    });
    const mine = setup({
      provider: worker({ presence: 'ABSENT' }),
      req: directed,
    });
    const result = await mine.service.nearby(auth('w1'));
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].direct).toBe(true);
    const other = setup({
      provider: worker({ id: 'p2', userId: 'w2' }),
      req: directed,
    });
    expect((await other.service.nearby(auth('w2'))).requests).toEqual([]);
    await expect(
      other.service.sendQuote(auth('w2'), 'r1', {
        amountMxn: 1,
        etaMinutes: 10,
        durationMinutes: 10,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('si no contesta, el cliente lo abre a todos', async () => {
    const { service, prisma } = setup({
      req: request({ targetProviderId: 'p1' }),
    });
    await service.openToAll(auth('c1'), 'r1');
    expect(prisma.presenteRequest.update.mock.calls[0][0].data).toEqual({
      targetProviderId: null,
    });
    const open = setup({ req: request() });
    await expect(open.service.openToAll(auth('c1'), 'r1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('en una visita agendada, la llegada es a la hora de la cita', async () => {
    const quotes = [
      {
        id: 'q1',
        providerId: 'p1',
        status: 'SENT',
        amountMxn: 500,
        etaMinutes: 30,
        durationMinutes: 60,
        provider: worker(),
      },
    ];
    const { service, prisma } = setup({
      req: request({
        quotes,
        scheduledFor: new Date(tuesdayTen),
        expiresAt: new Date(tuesdayTen),
      }),
    });
    await service.choose(auth('c1'), 'r1', 'q1');
    expect(
      prisma.presenteRequest.update.mock.calls[0][0].data.etaAt.toISOString(),
    ).toBe(tuesdayTen);
  });

  it('agrega y lista de confianza con estado de hoy', async () => {
    const { service, prisma } = setup({
      provider: worker(),
      favorites: [
        { providerId: 'p1', provider: worker({ availability: weekdays }) },
      ],
    });
    const list = await service.addFavorite(auth('c1'), 'p1');
    expect(prisma.presenteFavorite.upsert).toHaveBeenCalled();
    expect(list[0]).toMatchObject({
      id: 'p1',
      presentNow: true,
      takingRequests: true,
    });
    await expect(service.addFavorite(auth('w1'), 'p1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('búsqueda', () => {
  it('busca personas y negocios que llegan a ese municipio', async () => {
    const { service } = setup({
      providers: [
        worker({
          id: 'cerca',
          userId: 'u2',
          trades: ['PAN'],
          isBusiness: true,
        }),
        worker({
          id: 'lejos',
          userId: 'u3',
          trades: ['PAN'],
          municipalityCode: '16102',
          radiusKm: 5,
        }),
        worker({ id: 'yo', userId: 'c1', trades: ['PAN'] }),
      ],
    });
    const found = await service.search(auth('c1'), {
      trade: 'PAN',
      municipalityCode: '16053',
    });
    expect(found.map((p) => p.id)).toEqual(['cerca']);
    expect(found[0]).toMatchObject({ isBusiness: true, distanceKm: 0 });
    await expect(
      service.search(auth('c1'), { trade: 'PAN', municipalityCode: '99999' }),
    ).rejects.toThrow(BadRequestException);
  });
});
