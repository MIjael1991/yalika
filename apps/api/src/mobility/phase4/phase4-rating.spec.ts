import { ConflictException } from '@nestjs/common';

import { MobilityPhase4Service } from './phase4.service';

function build() {
  const prisma = {
    mobilityTrip: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 't1', status: 'COMPLETED' }),
    },
    mobilityRating: {
      create: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _avg: { stars: 4.5 } }),
    },
    mobilityDriver: { update: jest.fn() },
    mobilityAuditEvent: { create: jest.fn() },
  };
  return { prisma, service: new MobilityPhase4Service(prisma as never) };
}

const dto = {
  authorType: 'passenger',
  authorId: 'p1',
  targetType: 'driver',
  targetId: 'd1',
  stars: 5,
};

describe('Movilidad: calificaciones', () => {
  it('guarda los tipos en mayúsculas para que no haya calificaciones repetidas por escribirlos distinto', async () => {
    const { service, prisma } = build();
    prisma.mobilityRating.create.mockResolvedValue({ id: 'r1' });

    await service.createRating('t1', dto);

    const call = prisma.mobilityRating.create.mock.calls[0] as [
      { data: { authorType: string; targetType: string } },
    ];
    expect(call[0].data.authorType).toBe('PASSENGER');
    expect(call[0].data.targetType).toBe('DRIVER');
    // La calificación del conductor se recalcula aunque llegara en minúsculas.
    expect(prisma.mobilityDriver.update).toHaveBeenCalled();
  });

  it('calificar dos veces el mismo viaje responde 409, no un error del servidor', async () => {
    const { service, prisma } = build();
    prisma.mobilityRating.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.createRating('t1', dto as never)).rejects.toThrow(
      ConflictException,
    );
  });
});
