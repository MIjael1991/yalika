/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  callSummary,
  canCall,
  effectiveCallStatus,
  iceServers,
} from './presente-call.domain';
import { PresenteCallsService } from './presente-calls.service';

const auth = (id: string) => ({ user: { id, modules: ['all'] } }) as any;
const OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';

describe('reglas de las llamadas', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  it('solo con trabajador elegido, y hasta 2 días después de terminar', () => {
    expect(
      canCall({ status: 'OPEN', chosenQuoteId: null, finishedAt: null }, now),
    ).toBe(false);
    expect(
      canCall(
        { status: 'EN_ROUTE', chosenQuoteId: 'q', finishedAt: null },
        now,
      ),
    ).toBe(true);
    const finishedAt = new Date('2026-10-21T12:00:00Z');
    expect(
      canCall({ status: 'COMPLETED', chosenQuoteId: 'q', finishedAt }, now),
    ).toBe(true);
    expect(
      canCall(
        { status: 'COMPLETED', chosenQuoteId: 'q', finishedAt },
        new Date('2026-10-23T13:00:00Z'),
      ),
    ).toBe(false);
    expect(
      canCall(
        { status: 'CANCELLED', chosenQuoteId: 'q', finishedAt: null },
        now,
      ),
    ).toBe(false);
  });

  it('timbra 45 s y dura máximo 30 min', () => {
    const ringing = {
      status: 'RINGING',
      createdAt: new Date(now.getTime() - 46_000),
      answeredAt: null,
    };
    expect(effectiveCallStatus(ringing, now)).toBe('MISSED');
    expect(effectiveCallStatus({ ...ringing, createdAt: now }, now)).toBe(
      'RINGING',
    );
    expect(
      effectiveCallStatus(
        {
          status: 'ACCEPTED',
          createdAt: now,
          answeredAt: new Date(now.getTime() - 31 * 60_000),
        },
        now,
      ),
    ).toBe('ENDED');
  });

  it('lo que queda en el chat', () => {
    const answeredAt = new Date(now.getTime() - 4 * 60_000 - 20_000);
    expect(
      callSummary({
        outcome: 'ENDED',
        callerName: 'Ana',
        answeredAt,
        endedAt: now,
      }).text,
    ).toBe('Llamada de 4 min');
    expect(
      callSummary({
        outcome: 'ENDED',
        callerName: 'Ana',
        answeredAt: new Date(now.getTime() - 20_000),
        endedAt: now,
      }).text,
    ).toBe('Llamada de menos de 1 minuto');
    expect(
      callSummary({
        outcome: 'MISSED',
        callerName: 'Ana',
        answeredAt: null,
        endedAt: now,
      }).text,
    ).toBe('Llamada perdida de Ana');
  });

  it('TURN opcional desde el entorno', () => {
    expect(iceServers({})).toHaveLength(1);
    const withTurn = iceServers({
      PRESENTE_TURN_URLS: 'turn:turn.ejemplo.mx:3478, nada',
      PRESENTE_TURN_USERNAME: 'u',
      PRESENTE_TURN_CREDENTIAL: 'p',
    });
    expect(withTurn[1]).toEqual({
      urls: ['turn:turn.ejemplo.mx:3478'],
      username: 'u',
      credential: 'p',
    });
  });
});

function setup(over: { status?: string; calls?: any[] } = {}) {
  const request = {
    id: 'r1',
    clientUserId: 'c1',
    status: over.status ?? 'EN_ROUTE',
    chosenQuoteId: 'q1',
    finishedAt: null,
  };
  const chosen = {
    id: 'q1',
    provider: { userId: 'w1', displayName: 'Juan', businessName: 'El Rayo' },
  };
  const calls: any[] = over.calls ?? [];
  const prisma: any = {
    presenteCall: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `call${calls.length + 1}`,
          status: 'RINGING',
          answerSdp: null,
          createdAt: new Date(),
          answeredAt: null,
          endedAt: null,
          ...data,
        };
        calls.push(row);
        return row;
      }),
      findMany: jest.fn(async () =>
        calls.filter((c) => ['RINGING', 'ACCEPTED'].includes(c.status)),
      ),
      findUnique: jest.fn(
        async ({ where }: any) => calls.find((c) => c.id === where.id) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) =>
        calls.find((c) => c.id === where.id),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = calls.find((c) => c.id === where.id);
        const allowed = where.status?.in ?? [where.status];
        if (!row || !allowed.includes(row.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    presenteClient: {
      findUnique: jest.fn(async () => ({ displayName: 'Ana' })),
    },
    presenteMessage: { create: jest.fn() },
  };
  const jobs: any = {
    loadJob: jest.fn(async () => ({ request, chosen })),
    requireParticipant: jest.fn(async (a: any) => {
      if (!['c1', 'w1'].includes(a.user.id)) {
        throw new NotFoundException('Pedido no encontrado');
      }
      return {
        request,
        chosen,
        role: a.user.id === 'c1' ? 'CLIENT' : 'WORKER',
      };
    }),
  };
  const push: any = { notify: jest.fn(async () => 1) };
  const recordings: any[] = [];
  prisma.presenteCall.update = jest.fn(async ({ where, data }: any) =>
    Object.assign(
      calls.find((c) => c.id === where.id),
      data,
    ),
  );
  prisma.presenteCallRecording = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `rec${recordings.length + 1}`, ...data };
      recordings.push(row);
      return row;
    }),
    findUnique: jest.fn(
      async ({ where }: any) =>
        recordings.find((r) => r.id === where.id) ?? null,
    ),
  };
  const storage: any = {
    newKey: jest.fn((id: string, kind: string) => `private/${id}/${kind}`),
    put: jest.fn(),
    get: jest.fn(async () => Buffer.alloc(300, 1)),
  };
  return {
    service: new PresenteCallsService(prisma, jobs, push, storage),
    prisma,
    push,
    calls,
    storage,
    recordings,
  };
}

describe('llamadas por Tequio sin números', () => {
  it('llama, timbra con aviso, contesta y al colgar queda la duración en el chat', async () => {
    const { service, push, prisma, calls } = setup();
    const out = await service.start(auth('c1'), 'r1', OFFER);
    expect(out).toMatchObject({
      status: 'RINGING',
      direction: 'OUT',
      otherName: 'El Rayo',
      offerSdp: null,
    });
    expect(push.notify).toHaveBeenCalledWith(
      ['w1'],
      expect.objectContaining({ title: 'Ana te está llamando' }),
    );

    const incoming = await service.current(auth('w1'), 'r1');
    expect(incoming).toMatchObject({
      direction: 'IN',
      otherName: 'Ana',
      offerSdp: OFFER,
    });
    await expect(service.answer(auth('c1'), out.id, OFFER)).rejects.toThrow(
      ConflictException,
    );
    await service.answer(auth('w1'), out.id, `${OFFER}a=answer\r\n`);
    const caller = await service.get(auth('c1'), out.id);
    expect(caller).toMatchObject({
      status: 'ACCEPTED',
      answerSdp: `${OFFER}a=answer\r\n`,
    });

    calls[0].answeredAt = new Date(Date.now() - 3 * 60_000);
    await service.end(auth('w1'), out.id);
    await service.end(auth('c1'), out.id);
    expect(prisma.presenteMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.presenteMessage.create.mock.calls[0][0].data).toMatchObject({
      senderRole: 'SYSTEM',
      kind: 'CALL',
      body: 'Llamada de 3 min',
    });
  });

  it('si no contesta o rechaza queda como llamada perdida', async () => {
    const { service, prisma, push } = setup();
    const out = await service.start(auth('w1'), 'r1', OFFER);
    await service.end(auth('c1'), out.id);
    expect(prisma.presenteMessage.create.mock.calls[0][0].data).toMatchObject({
      body: 'Llamada perdida de El Rayo',
      meta: expect.objectContaining({ outcome: 'DECLINED' }),
    });
    expect(push.notify).toHaveBeenCalledTimes(1);

    const old = setup({
      calls: [
        {
          id: 'viejo',
          requestId: 'r1',
          callerUserId: 'w1',
          calleeUserId: 'c1',
          status: 'RINGING',
          offerSdp: OFFER,
          answerSdp: null,
          createdAt: new Date(Date.now() - 60_000),
          answeredAt: null,
          endedAt: null,
        },
      ],
    });
    expect(await old.service.current(auth('c1'), 'r1')).toBeNull();
    expect(old.calls[0].status).toBe('MISSED');
    expect(old.push.notify).toHaveBeenCalledWith(
      ['c1'],
      expect.objectContaining({ title: 'Llamada perdida de El Rayo' }),
    );
  });

  it('una llamada a la vez y solo entre los dos del trabajo', async () => {
    const { service } = setup();
    const out = await service.start(auth('c1'), 'r1', OFFER);
    await expect(service.start(auth('w1'), 'r1', OFFER)).rejects.toThrow(
      'Te están llamando',
    );
    await service.answer(auth('w1'), out.id, OFFER);
    await expect(service.start(auth('c1'), 'r1', OFFER)).rejects.toThrow(
      'Ya están en una llamada',
    );
    await expect(service.get(auth('extraño'), out.id)).rejects.toThrow(
      NotFoundException,
    );
    const closed = setup({ status: 'CANCELLED' });
    await expect(closed.service.start(auth('c1'), 'r1', OFFER)).rejects.toThrow(
      'Las llamadas se abren',
    );
  });
});

describe('grabar la llamada con aviso', () => {
  const audio = `data:audio/webm;codecs=opus;base64,${Buffer.alloc(3000, 7).toString('base64')}`;

  it('quien graba avisa al otro; al guardar la escuchan los dos', async () => {
    const { service, prisma, storage } = setup();
    const out = await service.start(auth('c1'), 'r1', OFFER);
    await expect(service.startRecording(auth('c1'), out.id)).rejects.toThrow(
      'llamada en curso',
    );
    await service.answer(auth('w1'), out.id, OFFER);
    await service.startRecording(auth('w1'), out.id);
    expect(await service.get(auth('c1'), out.id)).toMatchObject({
      recordingBy: 'OTHER',
    });
    expect(await service.get(auth('w1'), out.id)).toMatchObject({
      recordingBy: 'ME',
    });
    await expect(service.startRecording(auth('c1'), out.id)).rejects.toThrow(
      'ya está grabando',
    );
    const bodies = () =>
      prisma.presenteMessage.create.mock.calls.map((c: any) => c[0].data.body);
    expect(bodies()[0]).toContain('El Rayo empezó a grabar la llamada');

    const saved = await service.saveRecording(auth('w1'), out.id, audio, 130);
    expect(storage.put).toHaveBeenCalled();
    expect(bodies()[1]).toContain('Grabación de la llamada (2 min)');
    const heard = await service.recording(auth('c1'), 'r1', saved.id);
    expect(heard.mime).toBe('audio/webm');
    await expect(
      service.recording(auth('extraño'), 'r1', saved.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.saveRecording(
        auth('w1'),
        out.id,
        'data:text/plain;base64,aGk=',
        5,
      ),
    ).rejects.toThrow('no se pudo leer');
  });
});
