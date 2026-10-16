jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AssistantPreferenceService } from './assistant-preference.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('Visibilidad de modulos de Yalika', () => {
  it('rechaza una cuenta restringida', async () => {
    const findUnique = jest.fn();
    const upsert = jest.fn();

    const service = new AssistantPreferenceService({
      assistantPreference: { findUnique, upsert },
    } as unknown as PrismaService);

    await expect(
      service.findVisibleForUser('u1', ['surveys']),
    ).rejects.toThrow();

    await expect(
      service.updateVisibleForUser('u1', ['surveys'], ['life']),
    ).rejects.toThrow();

    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('distingue una cuenta nueva de una seleccion vacia', async () => {
    const service = new AssistantPreferenceService({
      assistantPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.findVisibleForUser('u1', ['all'])).resolves.toMatchObject({
      visibleModules: null,
    });
  });

  it('guarda solo modulos validos del usuario autenticado', async () => {
    const upsert = jest.fn().mockResolvedValue({
      visibleModules: ['life'],
    });

    const service = new AssistantPreferenceService({
      assistantPreference: { upsert },
    } as unknown as PrismaService);

    await expect(
      service.updateVisibleForUser('u1', ['all'], ['life']),
    ).resolves.toEqual({
      visibleModules: ['life'],
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: {
          userId: 'u1',
          visibleModules: ['life'],
        },
        update: {
          visibleModules: ['life'],
        },
      }),
    );

    await expect(
      service.updateVisibleForUser('u1', ['all'], ['unknown']),
    ).rejects.toThrow();

    await expect(
      service.updateVisibleForUser('u1', ['all'], ['life', 'life']),
    ).rejects.toThrow();

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('permite los cinco servicios sin ampliar permisos de cuenta', async () => {
    const visibleModules = ['surveys', 'life', 'health', 'pos', 'sites'];
    const upsert = jest.fn().mockResolvedValue({ visibleModules });
    const service = new AssistantPreferenceService({
      assistantPreference: { upsert },
    } as unknown as PrismaService);
    await expect(service.updateVisibleForUser('u1', ['all'], visibleModules))
      .resolves.toEqual({ visibleModules });
    await expect(service.updateVisibleForUser('u1', ['surveys'], ['health']))
      .rejects.toThrow();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('R8.2 disponibilidad de Salud', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  it.each([['production', undefined, false], ['production', 'true', true], ['test', 'false', false], ['test', undefined, true]])('entorno %s con bandera %s', async (env, flag, expected) => {
    Object.assign(process.env, { NODE_ENV: env });
    if (flag === undefined) delete process.env.CLINICAL_MODULE_ENABLED;
    else process.env.CLINICAL_MODULE_ENABLED = String(flag);
    const service = new AssistantPreferenceService({ assistantPreference: { findUnique: jest.fn().mockResolvedValue({ visibleModules: [] }) } } as unknown as PrismaService);
    const result = await service.findVisibleForUser('u1', ['all']);
    expect(result.visibleModules).toEqual([]);
    expect(result.availableModules.includes('health')).toBe(expected);
  });
});
