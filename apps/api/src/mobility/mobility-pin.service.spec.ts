import { HttpException } from '@nestjs/common';

import { DERIVED_PIN_MARKER, MobilityPinService } from './mobility-pin.service';

function build() {
  const prisma = {
    mobilityPinAttempt: { count: jest.fn(), create: jest.fn() },
    mobilityTrip: { updateMany: jest.fn() },
  };
  return { prisma, pins: new MobilityPinService(prisma as never) };
}

describe('Movilidad: PIN de seguridad', () => {
  const previous = process.env.YALIKA_PIN_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.YALIKA_PIN_SECRET;
    else process.env.YALIKA_PIN_SECRET = previous;
  });

  it('el PIN se calcula con la clave del servidor: es estable, de 4 dígitos y distinto por viaje', () => {
    process.env.YALIKA_PIN_SECRET = 'clave-uno';
    const { pins } = build();

    const first = pins.derivePin('trip-1');
    expect(first).toMatch(/^[1-9]\d{3}$/);
    expect(pins.derivePin('trip-1')).toBe(first);

    const others = new Set(
      Array.from({ length: 50 }, (_, i) => pins.derivePin(`trip-${i}`)),
    );
    expect(others.size).toBeGreaterThan(40);

    process.env.YALIKA_PIN_SECRET = 'clave-dos';
    const rotated = Array.from({ length: 50 }, (_, i) =>
      pins.derivePin(`trip-${i}`),
    );
    expect(rotated).not.toEqual(
      Array.from({ length: 50 }, (_, i) => {
        process.env.YALIKA_PIN_SECRET = 'clave-uno';
        return pins.derivePin(`trip-${i}`);
      }),
    );
  });

  it('un viaje nuevo no guarda el PIN y el pasajero lo recibe calculado', () => {
    process.env.YALIKA_PIN_SECRET = 'clave-uno';
    const { pins } = build();
    const trip = { id: 't1', safetyPin: pins.storedMarker() };

    expect(trip.safetyPin).toBe(DERIVED_PIN_MARKER);
    expect(pins.reveal(trip)).toBe(pins.derivePin('t1'));
    expect(pins.matchesTrip(trip, pins.derivePin('t1'))).toBe(true);
    expect(pins.matchesTrip(trip, '0000')).toBe(false);
  });

  it('un viaje antiguo con PIN en texto sigue funcionando hasta iniciarse', () => {
    const { pins } = build();
    const legacy = { id: 't2', safetyPin: '4821' };

    expect(pins.reveal(legacy)).toBe('4821');
    expect(pins.matchesTrip(legacy, '4821')).toBe(true);
    expect(pins.matchesTrip(legacy, '4822')).toBe(false);
  });

  it('viaje seguro: guarda un código con clave, no el PIN, y acepta el código antiguo', () => {
    process.env.YALIKA_PIN_SECRET = 'clave-uno';
    const { pins } = build();
    const digest = pins.safeRideDigest('r1', '7342');

    expect(digest.startsWith('h1:')).toBe(true);
    expect(digest).not.toContain('7342');
    expect(
      pins.matchesSafeRide({ id: 'r1', safetyPinHash: digest }, '7342'),
    ).toBe(true);
    expect(
      pins.matchesSafeRide({ id: 'r1', safetyPinHash: digest }, '7343'),
    ).toBe(false);
    // El mismo PIN en otro viaje da otro código.
    expect(pins.safeRideDigest('r2', '7342')).not.toBe(digest);

    // Código antiguo: sha256 sin clave del PIN "1234".
    const legacy =
      '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
    expect(pins.isLegacySafeRideDigest(legacy)).toBe(true);
    expect(
      pins.matchesSafeRide({ id: 'r1', safetyPinHash: legacy }, '1234'),
    ).toBe(true);
    expect(
      pins.matchesSafeRide({ id: 'r1', safetyPinHash: legacy }, '1235'),
    ).toBe(false);
  });

  it('el intento correcto se registra y deja los 5 intentos', async () => {
    const { pins, prisma } = build();
    prisma.mobilityPinAttempt.count.mockResolvedValue(0);

    const result = await pins.attempt('t1', () => true, { driverId: 'd1' });

    expect(result).toEqual({ success: true, attemptsRemaining: 5 });
    expect(prisma.mobilityPinAttempt.create).toHaveBeenCalledTimes(1);
  });

  it('un fallo se registra y descuenta un intento', async () => {
    const { pins, prisma } = build();
    prisma.mobilityPinAttempt.count.mockResolvedValue(2);

    const result = await pins.attempt('t1', () => false);

    expect(result).toEqual({ success: false, attemptsRemaining: 2 });
  });

  it('con 5 fallos recientes responde 429 y ni siquiera compara el PIN', async () => {
    const { pins, prisma } = build();
    prisma.mobilityPinAttempt.count.mockResolvedValue(5);
    const compare = jest.fn(() => true);

    const error = await pins.attempt('t1', compare).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(compare).not.toHaveBeenCalled();
    expect(prisma.mobilityPinAttempt.create).not.toHaveBeenCalled();
  });

  it('al arrancar retira los PIN en texto de viajes que ya no los necesitan', async () => {
    const { pins, prisma } = build();
    prisma.mobilityTrip.updateMany.mockResolvedValue({ count: 3 });

    await pins.onModuleInit();

    const call = prisma.mobilityTrip.updateMany.mock.calls[0] as [
      { where: { status: { in: string[] } }; data: { safetyPin: string } },
    ];
    expect(call[0].data.safetyPin).toBe(DERIVED_PIN_MARKER);
    // Los viajes que aún no inician conservan su PIN hasta que se use.
    expect(call[0].where.status.in).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    );
    expect(call[0].where.status.in).not.toContain('REQUESTED');
    expect(call[0].where.status.in).not.toContain('DRIVER_ARRIVED');
  });

  it('un fallo al limpiar no impide que el servidor arranque', async () => {
    const { pins, prisma } = build();
    prisma.mobilityTrip.updateMany.mockRejectedValue(new Error('sin base'));

    await expect(pins.onModuleInit()).resolves.toBeUndefined();
  });
});
