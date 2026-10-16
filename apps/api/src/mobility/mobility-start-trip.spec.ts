import { BadRequestException, HttpException } from '@nestjs/common';

import { MobilityPinService } from './mobility-pin.service';
import { MobilityService } from './mobility.service';

function build() {
  const prisma = {
    mobilityTrip: { findUnique: jest.fn(), update: jest.fn() },
    mobilityTripEvent: { create: jest.fn() },
    mobilityPinAttempt: { count: jest.fn(), create: jest.fn() },
  };
  const pins = new MobilityPinService(prisma as never);
  const service = new MobilityService(prisma as never, pins);
  prisma.mobilityTrip.findUnique.mockResolvedValue({
    id: 't1',
    status: 'DRIVER_ARRIVED',
    driverId: 'd1',
    safetyPin: pins.storedMarker(),
  });
  prisma.mobilityTrip.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: 't1', ...data }),
  );
  return { prisma, pins, service };
}

describe('Movilidad: iniciar el viaje con el PIN', () => {
  it('con el PIN correcto inicia y deja de guardar cualquier PIN', async () => {
    const { service, prisma, pins } = build();
    prisma.mobilityPinAttempt.count.mockResolvedValue(0);

    const started = await service.startTrip('t1', {
      driverId: 'd1',
      safetyPin: pins.derivePin('t1'),
    });

    expect(started).toMatchObject({
      status: 'IN_PROGRESS',
      safetyPin: 'derived:v1',
    });
  });

  it('con un PIN equivocado no inicia y el intento queda registrado', async () => {
    const { service, prisma } = build();
    prisma.mobilityPinAttempt.count.mockResolvedValue(0);

    await expect(
      service.startTrip('t1', { driverId: 'd1', safetyPin: '0000' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.mobilityTrip.update).not.toHaveBeenCalled();
    expect(prisma.mobilityPinAttempt.create).toHaveBeenCalledTimes(1);
  });

  it('tras 5 fallos seguidos ya no deja probar más PIN, ni siquiera el correcto', async () => {
    const { service, prisma, pins } = build();
    prisma.mobilityPinAttempt.count.mockResolvedValue(5);

    const error = await service
      .startTrip('t1', { driverId: 'd1', safetyPin: pins.derivePin('t1') })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.mobilityTrip.update).not.toHaveBeenCalled();
  });

  it('el pasajero recibe el PIN al pedir el viaje; en la base solo queda la marca', async () => {
    const { service, prisma, pins } = build();
    prisma.mobilityTrip.findUnique.mockReset();
    (
      prisma as unknown as { mobilityTrip: { create: jest.Mock } }
    ).mobilityTrip.create = jest.fn(
      ({ data }: { data: { safetyPin: string } }) =>
        Promise.resolve({ id: 't9', offers: [], ...data }),
    );

    const trip = (await service.createTrip({
      passengerUserId: 'p1',
      originAddress: 'A',
      originLat: 1,
      originLng: 1,
      destinationAddress: 'B',
      destinationLat: 2,
      destinationLng: 2,
    } as never)) as { safetyPin: string };

    const create = (
      prisma as unknown as { mobilityTrip: { create: jest.Mock } }
    ).mobilityTrip.create;
    const stored = (
      create.mock.calls[0] as [{ data: { safetyPin: string } }]
    )[0].data.safetyPin;

    expect(stored).toBe('derived:v1');
    expect(trip.safetyPin).toBe(pins.derivePin('t9'));
  });
});
