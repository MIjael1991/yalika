/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import { NotFoundException } from '@nestjs/common';

import {
  readAudioDataUrl,
  safetyKeepDays,
  userRecordOpen,
} from './presente-safety.domain';
import { PresenteSafetyService } from './presente-safety.service';

const auth = (id: string) => ({ user: { id, modules: ['all'] } }) as any;
const day = 86_400_000;

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  clientUserId: 'c1',
  status: 'COMPLETED',
  trades: ['PLOMERIA'],
  description: 'Fuga en el baño',
  municipalityCode: '16053',
  placeLabel: 'Casa',
  addressHint: 'Centro',
  createdAt: new Date(Date.now() - 3 * day),
  closedAt: new Date(Date.now() - 3 * day + 60_000),
  enRouteAt: null,
  arrivedAt: new Date(Date.now() - 2 * day),
  startedAt: null,
  finishedAt: new Date(Date.now() - 2 * day + 3_600_000),
  clientConfirmedAt: null,
  problemAt: null,
  scheduledFor: null,
  cancelReason: null,
  finalAmountMxn: 500,
  updatedAt: new Date(),
  expiresAt: new Date(),
  ...over,
});

function setup(req: any) {
  const chosen = {
    amountMxn: 500,
    provider: {
      id: 'p1',
      userId: 'w1',
      displayName: 'Juan',
      businessName: 'El Rayo',
      status: 'VERIFIED',
    },
  };
  const prisma: any = {
    presenteClient: {
      findUnique: jest.fn(async () => ({ displayName: 'Ana' })),
    },
    presenteMessage: {
      findMany: jest.fn(async () => [
        {
          createdAt: new Date(),
          senderRole: 'CLIENT',
          senderUserId: 'c1',
          body: '¿Ya vienes?',
        },
      ]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    presenteCall: {
      findMany: jest.fn(async () => [
        {
          createdAt: new Date(),
          callerUserId: 'w1',
          calleeUserId: 'c1',
          status: 'ENDED',
          answeredAt: new Date(Date.now() - 4 * 60_000),
          endedAt: new Date(),
        },
      ]),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    presenteCallRecording: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    presenteTrackPoint: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    presenteRequest: { findMany: jest.fn(async () => [req]) },
    presenteAuditEvent: { create: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const jobs: any = {
    loadJob: jest.fn(async () => ({ request: req, chosen })),
    requireParticipant: jest.fn(async (a: any) => {
      if (!['c1', 'w1'].includes(a.user.id)) {
        throw new NotFoundException('Pedido no encontrado');
      }
      return { request: req, chosen };
    }),
  };
  const storage: any = { get: jest.fn(), delete: jest.fn() };
  return {
    service: new PresenteSafetyService(prisma, jobs, storage),
    prisma,
    storage,
  };
}

describe('reglas de la sábana de seguridad', () => {
  it('los dos la ven 30 días después de terminar', () => {
    const finished = new Date('2026-09-01T12:00:00Z');
    const req = request({ finishedAt: finished });
    expect(userRecordOpen(req, new Date('2026-09-30T12:00:00Z'))).toBe(true);
    expect(userRecordOpen(req, new Date('2026-10-02T12:00:00Z'))).toBe(false);
    expect(
      userRecordOpen(request({ status: 'EN_ROUTE', finishedAt: null })),
    ).toBe(true);
  });

  it('el resguardo es de 1 año salvo que el abogado diga otra cosa', () => {
    expect(safetyKeepDays({})).toBe(365);
    expect(safetyKeepDays({ PRESENTE_SAFETY_KEEP_DAYS: '730' })).toBe(730);
    expect(safetyKeepDays({ PRESENTE_SAFETY_KEEP_DAYS: '5' })).toBe(30);
  });

  it('solo audio', () => {
    const ok = `data:audio/webm;codecs=opus;base64,${Buffer.alloc(500).toString('base64')}`;
    expect(readAudioDataUrl(ok)?.mime).toBe('audio/webm');
    expect(readAudioDataUrl('data:image/png;base64,AAAA')).toBeNull();
  });
});

describe('sábana de seguridad', () => {
  it('cliente y trabajador ven quién, cuándo, mensajes y llamadas; sin teléfonos', async () => {
    const { service } = setup(request());
    const record = await service.forParticipant(auth('c1'), 'r1');
    expect(record.sealed).toBe(false);
    expect(record.client.name).toBe('Ana');
    expect(record.worker?.name).toBe('El Rayo');
    expect(record.timeline.map((t) => t.label)).toContain(
      'Llegó (confirmado con el PIN del cliente)',
    );
    expect(record.messages[0]).toMatchObject({
      from: 'Ana',
      body: '¿Ya vienes?',
    });
    expect(record.calls[0]).toMatchObject({
      from: 'El Rayo',
      outcome: 'contestada',
      minutes: 4,
    });
    await expect(service.forParticipant(auth('otro'), 'r1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('a los 30 días queda sellada: solo con oficio de autoridad y queda registrado', async () => {
    const old = request({ finishedAt: new Date(Date.now() - 40 * day) });
    const { service, prisma } = setup(old);
    await expect(service.forParticipant(auth('c1'), 'r1')).rejects.toThrow(
      'sellado',
    );
    await expect(service.forAuthority('op', 'r1', ' ')).rejects.toThrow(
      'oficio',
    );
    await expect(
      service.forAuthority('op', 'no-es-codigo', 'FGE/123/2026'),
    ).rejects.toThrow('número de pedido');
    // Con los 8 caracteres que salen en el registro.
    const record = await service.forAuthority('op', '2B0D3B7E', 'FGE/123/2026');
    expect(record.sealed).toBe(true);
    expect(
      prisma.presenteAuditEvent.create.mock.calls[0][0].data,
    ).toMatchObject({
      actorUserId: 'op',
      action: 'SAFETY_RECORD_OPENED',
      metadata: { requestId: 'r1', authorityRef: 'FGE/123/2026' },
    });
  });

  it('se borra al cumplir el resguardo, no antes', async () => {
    const recent = setup(
      request({ finishedAt: new Date(Date.now() - 100 * day) }),
    );
    await recent.service.cleanup();
    expect(
      recent.prisma.presenteMessage.deleteMany.mock.calls[0][0].where.requestId
        .in,
    ).toEqual([]);
    const expired = setup(
      request({ finishedAt: new Date(Date.now() - 400 * day) }),
    );
    expired.prisma.presenteCallRecording.findMany.mockResolvedValue([
      { id: 'g1', storageKey: 'k1' },
    ]);
    await expired.service.cleanup();
    expect(
      expired.prisma.presenteMessage.deleteMany.mock.calls[0][0].where.requestId
        .in,
    ).toEqual(['r1']);
    expect(expired.storage.delete).toHaveBeenCalledWith('k1');
  });
});
