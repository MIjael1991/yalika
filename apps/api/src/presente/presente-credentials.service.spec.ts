/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import { BadRequestException, ConflictException } from '@nestjs/common';

import { PresenteCredentialsService } from './presente-credentials.service';
import { identityRecheck } from './presente.domain';

const auth = () => ({ user: { id: 'u1', modules: ['all'] } }) as any;

const jpeg = () => {
  const bytes = Buffer.alloc(20_000, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
};

function setup(provider: any, credential: any = null) {
  const prisma: any = {
    presenteProvider: {
      findUnique: jest.fn(async () => provider),
      update: jest.fn(),
    },
    presenteCredential: {
      upsert: jest.fn(),
      findUnique: jest.fn(async () => credential),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    presenteAuditEvent: { create: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const storage: any = {
    newKey: jest.fn(
      (id: string, kind: string) => `private/presente/${id}/${kind}`,
    ),
    put: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };
  return {
    service: new PresenteCredentialsService(prisma, storage),
    prisma,
    storage,
  };
}

const provider = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'u1',
  status: 'VERIFIED',
  trades: ['PLOMERIA'],
  biometricConsentAt: new Date(),
  credentials: [] as any[],
  ...over,
});

const dto = {
  trade: 'INGENIERIA_CIVIL',
  licenseNumber: '12345678',
  titlePhoto: jpeg(),
  selfiePhoto: jpeg(),
  sepProof: `data:application/pdf;base64,${Buffer.from('%PDF-1.7 constancia').toString('base64')}`,
};

describe('PresenteCredentialsService', () => {
  it('manda la cédula con foto del título y selfie con ella; queda en revisión', async () => {
    const { service, prisma, storage } = setup(provider());
    await service.submit(auth(), dto);
    expect(storage.put).toHaveBeenCalledTimes(3);
    expect(
      prisma.presenteCredential.upsert.mock.calls[0][0].create,
    ).toMatchObject({
      trade: 'INGENIERIA_CIVIL',
      licenseNumber: '12345678',
      status: 'PENDING',
      sepProofMime: 'application/pdf',
      sepProofCheckedAt: null,
    });
    // Mientras se revisa, todavía no la ofrece.
    expect(prisma.presenteProvider.update).not.toHaveBeenCalled();
  });

  it('el comprobante de la SEP es el PDF o una foto de la consulta', async () => {
    const { service } = setup(provider());
    await expect(
      service.submit(auth(), {
        ...dto,
        sepProof: `data:application/pdf;base64,${Buffer.from('no es pdf').toString('base64')}`,
      }),
    ).rejects.toThrow('PDF de la SEP');
    await service.submit(auth(), { ...dto, sepProof: jpeg() });
  });

  it('médicos, enfermería y veterinarios también mandan su cédula aquí', async () => {
    const { service, prisma } = setup(provider());
    await service.submit(auth(), { ...dto, trade: 'MEDICO' });
    expect(prisma.presenteCredential.upsert.mock.calls[0][0].create.trade).toBe(
      'MEDICO',
    );
  });

  it('solo profesiones con cédula, con permiso de foto y sin repetir una aprobada', async () => {
    await expect(
      setup(provider()).service.submit(auth(), { ...dto, trade: 'PLOMERIA' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      setup(provider({ biometricConsentAt: null })).service.submit(auth(), dto),
    ).rejects.toThrow('permiso');
    await expect(
      setup(
        provider({
          credentials: [{ trade: 'INGENIERIA_CIVIL', status: 'VERIFIED' }],
        }),
      ).service.submit(auth(), dto),
    ).rejects.toThrow(ConflictException);
  });

  it('al aprobar se agrega la profesión y se borran las fotos', async () => {
    const credential = {
      id: 'c1',
      providerId: 'p1',
      trade: 'INGENIERIA_CIVIL',
      status: 'PENDING',
      titleKey: 't',
      selfieKey: 's',
      sepProofKey: 'sep',
      provider: provider(),
    };
    const { service, prisma, storage } = setup(provider(), credential);
    await service.decide('op', 'c1', { approve: true });
    expect(storage.delete).toHaveBeenCalledWith('t');
    expect(storage.delete).toHaveBeenCalledWith('s');
    // El comprobante de la SEP se queda para que lo vean sus clientes.
    expect(storage.delete).not.toHaveBeenCalledWith('sep');
    expect(prisma.presenteProvider.update.mock.calls[0][0].data.trades).toEqual(
      ['PLOMERIA', 'INGENIERIA_CIVIL'],
    );
    expect(
      prisma.presenteCredential.update.mock.calls[0][0].data,
    ).toMatchObject({
      status: 'VERIFIED',
      titleKey: null,
      selfieKey: null,
      sepProofCheckedAt: expect.any(Date),
    });
    await expect(
      setup(provider(), { ...credential }).service.decide('op', 'c1', {
        approve: false,
      }),
    ).rejects.toThrow('motivo');
  });
});

describe('Comprobante de la SEP', () => {
  const approved = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    providerId: 'p1',
    trade: 'INGENIERIA_CIVIL',
    licenseNumber: '12345678',
    status: 'VERIFIED',
    sepProofKey: 'sep',
    sepProofMime: 'application/pdf',
    sepProofCheckedAt: new Date(),
    provider: { status: 'VERIFIED' },
    ...over,
  });

  it('quien ya tenía su cédula aprobada lo sube; espera revisión antes de verse', async () => {
    const credential = approved({ sepProofKey: null, sepProofCheckedAt: null });
    const { service, prisma } = setup(provider({ credentials: [credential] }));
    await service.uploadSepProof(auth(), 'INGENIERIA_CIVIL', jpeg());
    expect(
      prisma.presenteCredential.update.mock.calls[0][0].data,
    ).toMatchObject({ sepProofMime: 'image/jpeg', sepProofCheckedAt: null });
    await expect(
      service.uploadSepProof(auth(), 'CONTADURIA', jpeg()),
    ).rejects.toThrow('Primero manda tu cédula');
  });

  it('el operador revisa solo el comprobante de una cédula ya aprobada', async () => {
    const pending = approved({ sepProofCheckedAt: null });
    const ok = setup(provider(), pending);
    await ok.service.decide('op', 'c1', { approve: true });
    expect(
      ok.prisma.presenteCredential.update.mock.calls[0][0].data,
    ).toMatchObject({ sepProofCheckedAt: expect.any(Date) });
    expect(ok.prisma.presenteProvider.update).not.toHaveBeenCalled();

    const bad = setup(provider(), approved({ sepProofCheckedAt: null }));
    await bad.service.decide('op', 'c1', {
      approve: false,
      note: 'No se lee el número',
    });
    expect(bad.storage.delete).toHaveBeenCalledWith('sep');
    expect(
      bad.prisma.presenteCredential.update.mock.calls[0][0].data,
    ).toMatchObject({ sepProofKey: null });
  });

  it('los clientes solo ven el comprobante ya revisado', async () => {
    const shown = setup(provider(), approved());
    shown.storage.get.mockResolvedValue(Buffer.from('%PDF-1.7'));
    const proof = await shown.service.publicSepProof('p1', 'INGENIERIA_CIVIL');
    expect(proof).toMatchObject({
      mime: 'application/pdf',
      licenseNumber: '12345678',
    });
    expect(proof.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    await expect(
      setup(
        provider(),
        approved({ sepProofCheckedAt: null }),
      ).service.publicSepProof('p1', 'INGENIERIA_CIVIL'),
    ).rejects.toThrow('no está disponible');
  });
});

describe('Revalidar identidad', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  const verified = {
    status: 'VERIFIED',
    identityCheckedAt: base,
    reviewedAt: base,
  };
  const day = 86_400_000;

  it('cada 90 días pide selfie nueva, con 7 días de gracia', () => {
    expect(
      identityRecheck(verified, false, new Date(base.getTime() + 30 * day))
        ?.state,
    ).toBe('OK');
    expect(
      identityRecheck(verified, false, new Date(base.getTime() + 92 * day))
        ?.state,
    ).toBe('DUE');
    expect(
      identityRecheck(verified, false, new Date(base.getTime() + 98 * day))
        ?.state,
    ).toBe('OVERDUE');
    expect(
      identityRecheck(verified, true, new Date(base.getTime() + 98 * day))
        ?.state,
    ).toBe('PENDING');
    expect(identityRecheck({ ...verified, status: 'DRAFT' }, false)).toBeNull();
  });
});
