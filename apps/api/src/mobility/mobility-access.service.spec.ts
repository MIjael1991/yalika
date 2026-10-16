import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { MobilityAccessService } from './mobility-access.service';
import { MobilityController } from './mobility.controller';

function auth(id: string): AuthContext {
  return { user: { id } } as unknown as AuthContext;
}

function build() {
  const prisma = {
    mobilityDriver: { findUnique: jest.fn() },
    mobilityTrip: { findUnique: jest.fn() },
    mobilityVehicle: { findUnique: jest.fn() },
    mobilityVehicleTracker: { findUnique: jest.fn() },
    mobilityLostItemCase: { findUnique: jest.fn() },
    mobilitySafeRide: { findUnique: jest.fn() },
    mobilityNegotiationRequest: { findUnique: jest.fn() },
  };
  const access = new MobilityAccessService(prisma as never);
  return { prisma, access };
}

describe('Movilidad: cada persona solo toca lo suyo', () => {
  const previous = process.env.YALIKA_OPERATOR_USER_IDS;

  afterEach(() => {
    if (previous === undefined) delete process.env.YALIKA_OPERATOR_USER_IDS;
    else process.env.YALIKA_OPERATOR_USER_IDS = previous;
  });

  it('selfUser: usa la sesión y rechaza a otra persona', () => {
    const { access } = build();

    expect(access.selfUser(auth('u1'))).toBe('u1');
    expect(access.selfUser(auth('u1'), 'u1')).toBe('u1');
    expect(() => access.selfUser(auth('u1'), 'u2')).toThrow(ForbiddenException);
  });

  it('el operador sí puede actuar sobre otra persona', () => {
    process.env.YALIKA_OPERATOR_USER_IDS = 'ops';
    const { access } = build();

    expect(access.selfUser(auth('ops'), 'u2')).toBe('u2');
  });

  it('driverAccess: solo el dueño del perfil de conductor', async () => {
    const { access, prisma } = build();
    prisma.mobilityDriver.findUnique.mockResolvedValue({ userId: 'u1' });

    await expect(
      access.driverAccess(auth('u1'), 'd1'),
    ).resolves.toBeUndefined();
    await expect(access.driverAccess(auth('u2'), 'd1')).rejects.toThrow(
      ForbiddenException,
    );

    prisma.mobilityDriver.findUnique.mockResolvedValue(null);
    await expect(access.driverAccess(auth('u1'), 'dx')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('tripAccess: pasajero y conductor sí, un tercero no, viaje inexistente 404', async () => {
    const { access, prisma } = build();
    prisma.mobilityTrip.findUnique.mockResolvedValue({
      passengerUserId: 'p1',
      driver: { userId: 'c1' },
    });

    await expect(access.tripAccess(auth('p1'), 't1')).resolves.toBe(
      'PASSENGER',
    );
    await expect(access.tripAccess(auth('c1'), 't1')).resolves.toBe('DRIVER');
    await expect(access.tripAccess(auth('x'), 't1')).rejects.toThrow(
      ForbiddenException,
    );

    prisma.mobilityTrip.findUnique.mockResolvedValue(null);
    await expect(access.tripAccess(auth('p1'), 'no')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('actorIdentity: no se puede actuar como otro pasajero, conductor o sistema', async () => {
    const { access, prisma } = build();
    prisma.mobilityDriver.findUnique.mockResolvedValue({ userId: 'c1' });

    await expect(
      access.actorIdentity(auth('p1'), 'PASSENGER', 'p1'),
    ).resolves.toBeUndefined();
    await expect(
      access.actorIdentity(auth('p1'), 'PASSENGER', 'otro'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      access.actorIdentity(auth('c1'), 'DRIVER', 'd1'),
    ).resolves.toBeUndefined();
    await expect(
      access.actorIdentity(auth('p1'), 'DRIVER', 'd1'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      access.actorIdentity(auth('p1'), 'SYSTEM', 'x'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('calificaciones: solo a la otra parte de tu propio viaje', async () => {
    const { access, prisma } = build();
    prisma.mobilityTrip.findUnique.mockResolvedValue({
      passengerUserId: 'p1',
      driverId: 'd1',
      driver: { userId: 'c1' },
    });
    prisma.mobilityDriver.findUnique.mockResolvedValue({ userId: 'c1' });

    await expect(
      access.ratingParticipants(auth('p1'), 't1', {
        authorType: 'PASSENGER',
        authorId: 'p1',
        targetType: 'DRIVER',
        targetId: 'd1',
      }),
    ).resolves.toBeUndefined();

    // Calificar a un conductor ajeno para manipular su reputación.
    await expect(
      access.ratingParticipants(auth('p1'), 't1', {
        authorType: 'PASSENGER',
        authorId: 'p1',
        targetType: 'DRIVER',
        targetId: 'otro-conductor',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Calificar usando la identidad de otra persona.
    await expect(
      access.ratingParticipants(auth('p1'), 't1', {
        authorType: 'PASSENGER',
        authorId: 'otra-persona',
        targetType: 'DRIVER',
        targetId: 'd1',
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      access.ratingParticipants(auth('c1'), 't1', {
        authorType: 'DRIVER',
        authorId: 'd1',
        targetType: 'PASSENGER',
        targetId: 'p1',
      }),
    ).resolves.toBeUndefined();
  });

  it('tripView: un conductor registrado ve viajes en negociación, no los ya asignados a otro', async () => {
    const { access, prisma } = build();
    prisma.mobilityDriver.findUnique.mockResolvedValue({ id: 'd9' });

    prisma.mobilityTrip.findUnique.mockResolvedValue({
      status: 'REQUESTED',
      passengerUserId: 'p1',
      driver: null,
    });
    await expect(access.tripView(auth('c9'), 't1')).resolves.toBe('CANDIDATE');

    prisma.mobilityTrip.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      passengerUserId: 'p1',
      driver: { userId: 'c1' },
    });
    await expect(access.tripView(auth('c9'), 't1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('hidePin: el PIN solo lo ve el pasajero (y el operador)', () => {
    const { access } = build();
    const trip = { id: 't1', safetyPin: '1234' };

    expect(access.hidePin(trip, 'PASSENGER')).toHaveProperty('safetyPin');
    expect(access.hidePin(trip, 'OPERATOR')).toHaveProperty('safetyPin');
    expect(access.hidePin(trip, 'DRIVER')).not.toHaveProperty('safetyPin');
    expect(access.hidePin(trip, 'CANDIDATE')).not.toHaveProperty('safetyPin');
  });

  it('negociaciones: la administra quien la pidió; la ven también los conductores', async () => {
    const { access, prisma } = build();
    prisma.mobilityNegotiationRequest.findUnique.mockResolvedValue({
      passengerUserId: 'p1',
    });

    await expect(
      access.negotiationOwner(auth('p1'), 'n1'),
    ).resolves.toBeUndefined();
    await expect(access.negotiationOwner(auth('x'), 'n1')).rejects.toThrow(
      ForbiddenException,
    );

    prisma.mobilityDriver.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(
      access.negotiationVisible(auth('c1'), 'n1'),
    ).resolves.toBeUndefined();

    prisma.mobilityDriver.findUnique.mockResolvedValue(null);
    await expect(access.negotiationVisible(auth('x'), 'n1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('viaje seguro: pasajero o conductor del viaje, nadie más', async () => {
    const { access, prisma } = build();
    prisma.mobilitySafeRide.findUnique.mockResolvedValue({
      passengerUserId: 'p1',
      driverId: 'd1',
    });
    prisma.mobilityDriver.findUnique.mockResolvedValue({ userId: 'c1' });

    await expect(
      access.safeRideAccess(auth('p1'), 's1'),
    ).resolves.toBeUndefined();
    await expect(
      access.safeRideAccess(auth('c1'), 's1'),
    ).resolves.toBeUndefined();
    await expect(access.safeRideAccess(auth('x'), 's1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('Movilidad: el viaje no filtra el PIN al conductor', () => {
  function controller() {
    const { access, prisma } = build();
    const service = {
      getTrip: jest.fn(),
      listTrips: jest.fn(),
    };
    return {
      prisma,
      service,
      controller: new MobilityController(service as never, access),
    };
  }

  it('getTrip: el conductor asignado no recibe safetyPin; el pasajero sí', async () => {
    const { controller: c, prisma, service } = controller();
    prisma.mobilityTrip.findUnique.mockResolvedValue({
      status: 'DRIVER_EN_ROUTE',
      passengerUserId: 'p1',
      driver: { userId: 'c1' },
    });
    service.getTrip.mockResolvedValue({ id: 't1', safetyPin: '4321' });

    const asDriver = await c.getTrip(auth('c1'), 't1');
    const asPassenger = await c.getTrip(auth('p1'), 't1');

    expect(asDriver).not.toHaveProperty('safetyPin');
    expect(asPassenger).toHaveProperty('safetyPin', '4321');
  });

  it('listTrips: sin filtros solo lista los viajes propios', async () => {
    const { controller: c, service } = controller();
    service.listTrips.mockResolvedValue([]);

    await c.listTrips(auth('p1'));

    expect(service.listTrips).toHaveBeenCalledWith({
      passengerUserId: 'p1',
      driverId: undefined,
      status: undefined,
    });
  });

  it('listTrips: pedir los viajes de otra persona se rechaza', async () => {
    const { controller: c } = controller();

    await expect(c.listTrips(auth('p1'), 'otra-persona')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
