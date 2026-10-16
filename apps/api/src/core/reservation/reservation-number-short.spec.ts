jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../../prisma/prisma.service';
import { ReservationService } from './reservation.service';

describe('Reservation short folio', () => {
  it('uses a short readable public folio', () => {
    const service = new ReservationService({} as PrismaService) as unknown as {
      nextReservationNumber(): string;
    };
    for (let i = 0; i < 20; i += 1) {
      expect(service.nextReservationNumber()).toMatch(/^AP-\d{6}-[A-F0-9]{5}$/);
    }
  });
});
