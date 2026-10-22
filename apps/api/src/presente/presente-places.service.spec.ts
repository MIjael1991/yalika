/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- dobles de prueba */
import { ConflictException, NotFoundException } from '@nestjs/common';

import { isOutdatedDatabase } from './presente-errors.filter';
import { placeAddress, PresentePlacesService } from './presente-places.service';
import { MAX_PLACES } from './presente.constants';

const auth = (id = 'c1') => ({ user: { id, modules: ['all'] } }) as any;

const place = (over: Record<string, unknown> = {}) => ({
  id: 'pl1',
  clientUserId: 'c1',
  label: 'Casa',
  street: 'Juárez',
  number: '12',
  neighborhood: null,
  municipalityCode: '16053',
  lat: 19.7,
  lng: -101.18,
  reference: null,
  photoKey: null,
  photoMime: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function setup(
  opts: { places?: any[]; client?: any; count?: number; busy?: number } = {},
) {
  let stored = opts.places ?? [];
  const prisma: any = {
    presentePlace: {
      findMany: jest.fn(async () => stored),
      findUnique: jest.fn(
        async (args: any) => stored.find((p) => p.id === args.where.id) ?? null,
      ),
      count: jest.fn(async () => opts.count ?? stored.length),
      create: jest.fn(async (args: any) => {
        const created = place({ id: `pl${stored.length + 1}`, ...args.data });
        stored = [...stored, created];
        return created;
      }),
      update: jest.fn(async (args: any) => place(args.data)),
      delete: jest.fn(),
    },
    presenteClient: {
      findUnique: jest.fn(async () =>
        opts.client === undefined
          ? { id: 'cl', displayName: 'Ana' }
          : opts.client,
      ),
      update: jest.fn(),
    },
    presenteRequest: { count: jest.fn(async () => opts.busy ?? 0) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const storage: any = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
  return {
    service: new PresentePlacesService(prisma, storage),
    prisma,
    storage,
  };
}

const dto = {
  label: 'Casa de mamá',
  street: 'Av. Madero',
  number: '120',
  municipalityCode: '16053',
  lat: 19.7,
  lng: -101.18,
};

describe('PresentePlacesService', () => {
  it('arma la dirección con calle, número y colonia', () => {
    expect(
      placeAddress({
        street: 'Av. Madero',
        number: '120',
        neighborhood: 'Centro',
      }),
    ).toBe('Av. Madero 120, col. Centro');
    expect(
      placeAddress({ street: 'Juárez', number: null, neighborhood: null }),
    ).toBe('Juárez');
  });

  it('pasa la casa que ya tenía guardada a un lugar "Casa" con su foto', async () => {
    const { service, prisma } = setup({
      client: {
        id: 'cl',
        homeLat: 19.7,
        homeLng: -101.19,
        homeReference: 'Portón café',
        housePhotoKey: 'k',
        housePhotoMime: 'image/jpeg',
      },
    });
    const list = await service.list(auth());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      label: 'Casa',
      reference: 'Portón café',
      hasPhoto: true,
      municipalityCode: '16053',
    });
    expect(
      prisma.presenteClient.update.mock.calls[0][0].data.housePhotoKey,
    ).toBeNull();
  });

  it('pide el nombre antes del primer lugar y limita cuántos se guardan', async () => {
    await expect(
      setup({ client: null }).service.create(auth(), dto),
    ).rejects.toThrow('nombre');
    await expect(
      setup({ count: MAX_PLACES }).service.create(auth(), dto),
    ).rejects.toThrow(ConflictException);
    const view = await setup().service.create(auth(), dto);
    expect(view.label).toBe('Casa de mamá');
    expect(view.municipalityName).toBeTruthy();
  });

  it('nadie ve ni borra el lugar de otra persona', async () => {
    const { service } = setup({ places: [place({ clientUserId: 'otra' })] });
    await expect(service.photo(auth(), 'pl1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(auth(), 'pl1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('no deja borrar un lugar con un pedido en curso; si no, borra también su foto', async () => {
    const busy = setup({ places: [place()], busy: 1 });
    await expect(busy.service.remove(auth(), 'pl1')).rejects.toThrow(
      'en curso',
    );
    const free = setup({ places: [place({ photoKey: 'foto' })] });
    await free.service.remove(auth(), 'pl1');
    expect(free.storage.delete).toHaveBeenCalledWith('foto');
  });
});

describe('Errores de Presente', () => {
  it('reconoce una base de datos sin las tablas o columnas nuevas', () => {
    expect(isOutdatedDatabase({ code: 'P2022' })).toBe(true);
    expect(isOutdatedDatabase({ code: 'P2021' })).toBe(true);
    expect(isOutdatedDatabase({ code: 'P2002' })).toBe(false);
    expect(isOutdatedDatabase(new Error('x'))).toBe(false);
  });
});
