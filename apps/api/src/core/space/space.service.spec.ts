jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { AuthenticatedUser } from '../../auth/auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import { SpaceService } from './space.service';

describe('SpaceService personal space protection', () => {
  const owner: AuthenticatedUser = {
    id: 'user-1',
    name: 'Usuario',
    email: 'usuario@example.com',
    companyId: 'company-1',
    role: null,
    modules: ['all'],
    homePath: '/servicios',
  };
  const existingPersonal = {
    id: 'space-personal',
    name: 'Mi vida',
    type: 'personal',
    status: 'active',
    ownerUserId: owner.id,
    members: [],
    _count: { tasks: 3 },
  };

  it('reuses the active personal space instead of creating a duplicate', async () => {
    const create = jest.fn();
    const service = new SpaceService({
      space: {
        findFirst: jest.fn().mockResolvedValue(existingPersonal),
        create,
      },
    } as unknown as PrismaService);

    const result = await service.create(
      {
        name: 'Otra vida',
        type: 'personal',
      },
      owner,
    );

    expect(result).toMatchObject({
      id: 'space-personal',
      reused: true,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('recovers safely when two windows create a personal space together', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingPersonal);
    const service = new SpaceService({
      space: {
        findFirst,
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    } as unknown as PrismaService);

    const result = await service.create(
      {
        name: 'Mi vida',
        type: 'personal',
      },
      owner,
    );

    expect(result).toMatchObject({
      id: 'space-personal',
      reused: true,
    });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('still allows independent business spaces', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'space-business',
      name: 'Mi negocio',
      type: 'business',
    });
    const findFirst = jest.fn();
    const service = new SpaceService({
      space: {
        findFirst,
        create,
      },
    } as unknown as PrismaService);

    const result = await service.create(
      {
        name: 'Mi negocio',
        type: 'business',
      },
      owner,
    );

    expect(result).toMatchObject({
      id: 'space-business',
      reused: false,
    });
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
