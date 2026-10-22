/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- dobles de prueba */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { PresenteService } from './presente.service';

const auth = (id = 'u1') => ({ user: { id, modules: ['all'] } }) as any;

const baseProvider = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'u1',
  displayName: 'Juan Pérez',
  trades: ['PLOMERIA'],
  zoneLabel: 'Centro',
  municipalityCode: '16053',
  radiusKm: 5,
  availability: {
    days: [1, 2, 3, 4, 5],
    allDay: false,
    from: '08:00',
    to: '20:00',
  },
  curpHash: 'hash',
  curpEncrypted: null,
  curpLast4: 'RL04',
  status: 'DRAFT',
  biometricConsentAt: new Date(),
  consentVersion: 'v1',
  submittedAt: null,
  reviewedAt: null,
  reviewedByUserId: null,
  reviewNote: null,
  presence: 'ABSENT',
  presenceChangedAt: null,
  lastSeenAt: null,
  documents: [] as { id: string; kind: string; objectKey: string }[],
  credentials: [] as any[],
  identityCheckedAt: null as Date | null,
  ...over,
});

const jpegDataUrl = () => {
  const bytes = Buffer.alloc(20_000, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
};

function setup(
  provider: ReturnType<typeof baseProvider> | null,
  clinical: any = null,
  activeJobs = 0,
) {
  const prisma: any = {
    clinicalProfessionalProfile: {
      findUnique: jest.fn(async () => clinical ?? null),
    },
    presenteProvider: {
      findUnique: jest.fn(async (args: any) => {
        if (args.where.curpHash) return null;
        return provider;
      }),
      upsert: jest.fn(async (args: any) => ({
        ...baseProvider(),
        ...args.create,
      })),
      update: jest.fn(async (args: any) => ({ ...provider, ...args.data })),
      delete: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    presenteDocument: {
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    presenteAuditEvent: { create: jest.fn() },
    presenteQuote: { count: jest.fn(async () => activeJobs) },
    presenteProviderPhoto: {
      findMany: jest.fn(async () => [{ objectKey: 'foto-trabajo' }]),
    },
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
  const wallet: any = { ensureWelcome: jest.fn(), rewardReferrer: jest.fn() };
  return {
    service: new PresenteService(prisma, storage, wallet),
    prisma,
    storage,
    wallet,
  };
}

const profile = (curp?: string) => ({
  displayName: 'Juan Pérez',
  trades: ['PLOMERIA', 'PLOMERIA'],
  municipalityCode: '16053',
  availableDays: [1, 2, 3, 4, 5, 6],
  allDay: false,
  fromTime: '08:00',
  toTime: '20:00',
  curp,
});

describe('PresenteService · registro', () => {
  it('guarda quién lo recomendó con su código; no vale el propio ni uno que no existe', async () => {
    const ok = setup(null);
    ok.prisma.presenteProvider.findMany.mockResolvedValueOnce([
      { id: 'abcdef12-0000-4000-8000-000000000000', userId: 'otro' },
    ]);
    await ok.service.saveProfile(auth(), {
      ...profile(),
      referralCode: 'yp abcdef12',
    });
    expect(
      ok.prisma.presenteProvider.upsert.mock.calls[0][0].create
        .referredByProviderId,
    ).toBe('abcdef12-0000-4000-8000-000000000000');

    const own = setup(null);
    own.prisma.presenteProvider.findMany.mockResolvedValueOnce([
      { id: 'abcdef12-0000-4000-8000-000000000000', userId: 'u1' },
    ]);
    await expect(
      own.service.saveProfile(auth(), {
        ...profile(),
        referralCode: 'YPABCDEF12',
      }),
    ).rejects.toThrow('código de recomendación');

    const none = setup(null);
    await expect(
      none.service.saveProfile(auth(), {
        ...profile(),
        referralCode: 'YP00000000',
      }),
    ).rejects.toThrow('código de recomendación');
  });

  it('guarda días y horario, y rechaza oficios con cédula', async () => {
    const { service, prisma } = setup(null);
    await service.saveProfile(auth(), profile());
    expect(
      prisma.presenteProvider.upsert.mock.calls[0][0].create.availability,
    ).toEqual({
      days: [1, 2, 3, 4, 5, 6],
      allDay: false,
      from: '08:00',
      to: '20:00',
    });
    await expect(
      service.saveProfile(auth(), { ...profile(), trades: ['MEDICO'] }),
    ).rejects.toThrow('manda tu cédula');
    await expect(
      service.saveProfile(auth(), {
        ...profile(),
        trades: ['TRASLADO_AMBULANCIA'],
      }),
    ).rejects.toThrow('cédula');
    // Ingeniería, contaduría, leyes... se agregan con su cédula, no en la lista de oficios.
    await expect(
      service.saveProfile(auth(), {
        ...profile(),
        trades: ['INGENIERIA_CIVIL'],
      }),
    ).rejects.toThrow('Mis cédulas');
    await expect(
      service.saveProfile(auth(), {
        ...profile(),
        availableDays: [],
        allDay: true,
      }),
    ).rejects.toThrow('día');
  });

  it('ya verificado cambia oficios pero no su nombre ni CURP', async () => {
    const { service, prisma } = setup(baseProvider({ status: 'VERIFIED' }));
    await service.saveProfile(auth(), {
      ...profile(),
      trades: ['PLOMERIA', 'ELECTRICIDAD'],
    });
    expect(
      prisma.presenteProvider.upsert.mock.calls[0][0].update.trades,
    ).toEqual(['PLOMERIA', 'ELECTRICIDAD']);
    await expect(
      service.saveProfile(auth(), { ...profile(), displayName: 'Otro nombre' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.saveProfile(auth(), profile('HEGG560427MVZRRL04')),
    ).rejects.toThrow(ConflictException);
  });

  it('médico con cédula verificada en Salud sí puede ofrecer consultas', async () => {
    const verified = {
      profession: 'Médico Cirujano',
      verificationStatus: 'VERIFIED',
      active: true,
    };
    const ok = setup(null, verified);
    await ok.service.saveProfile(auth(), { ...profile(), trades: ['MEDICO'] });
    expect(ok.prisma.presenteProvider.upsert).toHaveBeenCalled();
    // Con cédula de médico no puede ofrecer veterinaria.
    const vet = setup(null, verified);
    await expect(
      vet.service.saveProfile(auth(), {
        ...profile(),
        trades: ['VETERINARIO'],
      }),
    ).rejects.toThrow('manda tu cédula');
    // Cédula pendiente de verificar: no.
    const pending = setup(null, { ...verified, verificationStatus: 'PENDING' });
    await expect(
      pending.service.saveProfile(auth(), { ...profile(), trades: ['MEDICO'] }),
    ).rejects.toThrow('manda tu cédula');
    // Si su cédula de médico ya se aprobó en Tequio, la conserva sin pasar por Salud.
    const approved = setup(baseProvider({ trades: ['MEDICO'] }));
    await approved.service.saveProfile(auth(), {
      ...profile(),
      trades: ['MEDICO', 'PLOMERIA'],
    });
    expect(
      approved.prisma.presenteProvider.upsert.mock.calls[0][0].update.trades,
    ).toEqual(expect.arrayContaining(['MEDICO', 'PLOMERIA']));
  });

  it('pide un municipio del catálogo', async () => {
    const { service } = setup(null);
    await expect(
      service.saveProfile(auth(), { ...profile(), municipalityCode: '99999' }),
    ).rejects.toThrow('municipio');
  });

  it('guarda la CURP cifrada, con huella y últimos 4; nunca en texto', async () => {
    const { service, prisma } = setup(null);
    const view = await service.saveProfile(
      auth(),
      profile('hegg560427mvzrrl04'),
    );
    const data = prisma.presenteProvider.upsert.mock.calls[0][0].create;
    expect(data.curpEncrypted).not.toContain('HEGG560427MVZRRL04');
    expect(data.curpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.curpLast4).toBe('RL04');
    expect(data.trades).toEqual(['PLOMERIA']);
    expect(JSON.stringify(view)).not.toContain('HEGG560427MVZRRL04');
    expect(view.curpMasked).toBe('**************RL04');
    const audit = prisma.presenteAuditEvent.create.mock.calls[0][0].data;
    expect(JSON.stringify(audit)).not.toContain('HEGG');
  });

  it('rechaza CURP inválida y de menores de edad', async () => {
    const { service } = setup(null);
    await expect(
      service.saveProfile(auth(), profile('HEGG560427MVZRRL05')),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.saveProfile(auth(), profile('LOPM100620MDFPRRA8')),
    ).rejects.toThrow('mayor de edad');
  });

  it('no deja usar una CURP que ya es de otra cuenta', async () => {
    const { service, prisma } = setup(null);
    prisma.presenteProvider.findUnique.mockImplementation(async (args: any) =>
      args.where.curpHash ? { userId: 'otra' } : null,
    );
    await expect(
      service.saveProfile(auth(), profile('HEGG560427MVZRRL04')),
    ).rejects.toThrow(ConflictException);
  });

  it('no se edita mientras está en revisión', async () => {
    const { service } = setup(baseProvider({ status: 'PENDING_REVIEW' }));
    await expect(service.saveProfile(auth(), profile())).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('PresenteService · fotos y envío', () => {
  it('la selfie necesita permiso expreso', async () => {
    const { service, storage } = setup(
      baseProvider({ biometricConsentAt: null }),
    );
    await expect(
      service.uploadDocument(auth(), {
        kind: 'SELFIE',
        dataUrl: jpegDataUrl(),
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('guarda la foto en el almacenamiento privado y reemplaza la anterior', async () => {
    const old = { id: 'd0', kind: 'INE_FRONT', objectKey: 'vieja' };
    const { service, storage, prisma } = setup(
      baseProvider({ documents: [old] }),
    );
    await service.uploadDocument(auth(), {
      kind: 'INE_FRONT',
      dataUrl: jpegDataUrl(),
    });
    expect(storage.put).toHaveBeenCalledWith(
      'private/presente/p1/INE_FRONT',
      expect.any(Buffer),
    );
    expect(prisma.presenteDocument.upsert).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('vieja');
  });

  it('retirar el permiso borra la selfie', async () => {
    const selfie = { id: 'd1', kind: 'SELFIE', objectKey: 'selfie-key' };
    const { service, storage, prisma } = setup(
      baseProvider({ documents: [selfie] }),
    );
    await service.setConsent(auth(), false);
    expect(storage.delete).toHaveBeenCalledWith('selfie-key');
    expect(prisma.presenteDocument.delete).toHaveBeenCalledWith({
      where: { id: 'd1' },
    });
  });

  it('no manda a revisión si faltan fotos', async () => {
    const { service } = setup(baseProvider());
    await expect(service.submit(auth())).rejects.toMatchObject({
      response: { missing: ['INE_FRONT', 'INE_BACK', 'SELFIE'] },
    });
  });

  it('manda a revisión cuando todo está completo', async () => {
    const docs = ['INE_FRONT', 'INE_BACK', 'SELFIE'].map((kind) => ({
      id: kind,
      kind,
      objectKey: kind,
    }));
    const { service, prisma } = setup(baseProvider({ documents: docs }));
    const view = await service.submit(auth());
    expect(prisma.presenteProvider.update.mock.calls[0][0].data.status).toBe(
      'PENDING_REVIEW',
    );
    expect(view.status).toBe('PENDING_REVIEW');
  });
});

describe('PresenteService · Presente / Ausente', () => {
  it('sin verificar no puede ponerse Presente', async () => {
    const { service } = setup(baseProvider({ status: 'PENDING_REVIEW' }));
    await expect(service.setPresence(auth(), true)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('verificado se pone Presente y queda registrado', async () => {
    const { service, prisma } = setup(baseProvider({ status: 'VERIFIED' }));
    const view = await service.setPresence(auth(), true);
    expect(view.presence).toBe('PRESENT');
    expect(prisma.presenteAuditEvent.create.mock.calls[0][0].data.action).toBe(
      'PRESENT',
    );
  });

  it('de baja temporal no puede ponerse Presente', async () => {
    const { service } = setup(
      baseProvider({
        status: 'VERIFIED',
        suspendedUntil: new Date(Date.now() + 86_400_000),
      }),
    );
    await expect(service.setPresence(auth(), true)).rejects.toThrow(
      'baja temporal',
    );
  });

  it('darse de baja guarda su registro y al volver regresa verificado', async () => {
    const { service, storage, prisma } = setup(
      baseProvider({ status: 'VERIFIED', presence: 'PRESENT' }),
    );
    const view = await service.withdraw(auth());
    expect(view.status).toBe('WITHDRAWN');
    expect(view.presence).toBe('ABSENT');
    expect(prisma.presenteProvider.update.mock.calls[0][0].data).toMatchObject({
      status: 'WITHDRAWN',
      statusBeforeWithdraw: 'VERIFIED',
    });
    expect(prisma.presenteProvider.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();

    const back = setup(
      baseProvider({ status: 'WITHDRAWN', statusBeforeWithdraw: 'VERIFIED' }),
    );
    const returned = await back.service.comeBack(auth());
    expect(returned.status).toBe('VERIFIED');
  });

  it('dado de baja no puede ponerse Presente', async () => {
    const { service } = setup(baseProvider({ status: 'WITHDRAWN' }));
    await expect(service.setPresence(auth(), true)).rejects.toThrow(
      'Volver a ofrecer',
    );
  });

  it('no se puede dar de baja con un trabajo en curso', async () => {
    const { service } = setup(baseProvider({ status: 'VERIFIED' }), null, 1);
    await expect(service.withdraw(auth())).rejects.toThrow('trabajo en curso');
    await expect(service.deleteForever(auth())).rejects.toThrow(
      'trabajo en curso',
    );
  });

  it('borrar para siempre borra también las fotos de su trabajo', async () => {
    const { service, storage } = setup(
      baseProvider({
        documents: [{ id: 'd', kind: 'INE_FRONT', objectKey: 'ine' }],
      }),
    );
    await service.deleteForever(auth());
    expect(storage.delete).toHaveBeenCalledWith('ine');
    expect(storage.delete).toHaveBeenCalledWith('foto-trabajo');
  });

  it('cualquiera puede ponerse Ausente', async () => {
    const { service } = setup(
      baseProvider({ status: 'SUSPENDED', presence: 'PRESENT' }),
    );
    const view = await service.setPresence(auth(), false);
    expect(view.presence).toBe('ABSENT');
  });
});

describe('PresenteService · operador', () => {
  const docs = ['INE_FRONT', 'INE_BACK', 'SELFIE'].map((kind) => ({
    id: kind,
    kind,
    objectKey: `k-${kind}`,
  }));

  it('al aprobar borra el INE y guarda solo la selfie (cifrada) para revalidar después', async () => {
    const { service, storage, prisma, wallet } = setup(
      baseProvider({ status: 'PENDING_REVIEW', documents: docs }),
    );
    const result = await service.decide('op', 'p1', { approve: true });
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(storage.delete).not.toHaveBeenCalledWith('k-SELFIE');
    expect(prisma.presenteDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['INE_FRONT', 'INE_BACK'] } },
    });
    expect(
      prisma.presenteProvider.update.mock.calls[0][0].data.identityCheckedAt,
    ).toBeInstanceOf(Date);
    expect(result.status).toBe('VERIFIED');
    expect(wallet.ensureWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', status: 'VERIFIED' }),
      'op',
    );
  });

  it('rechazar pide motivo', async () => {
    const { service, storage } = setup(
      baseProvider({ status: 'PENDING_REVIEW', documents: docs }),
    );
    await expect(
      service.decide('op', 'p1', { approve: false }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('solo decide registros en revisión', async () => {
    const { service } = setup(baseProvider({ status: 'VERIFIED' }));
    await expect(service.decide('op', 'p1', { approve: true })).rejects.toThrow(
      ConflictException,
    );
  });

  it('suspender deja Ausente', async () => {
    const { service, prisma } = setup(
      baseProvider({ status: 'VERIFIED', presence: 'PRESENT' }),
    );
    await service.suspend('op', 'p1', 'Reporte de cliente');
    expect(prisma.presenteProvider.update.mock.calls[0][0].data).toMatchObject({
      status: 'SUSPENDED',
      presence: 'ABSENT',
    });
  });
});
