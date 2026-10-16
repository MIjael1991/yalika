import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { MobilityPhase7Service } from './phase7.service';

const ME = 'user-yo';
const OTHER = 'user-otro';

function build(
  prisma: Record<string, unknown>,
  phase6: Record<string, unknown> = {},
) {
  return new MobilityPhase7Service(prisma as never, phase6 as never);
}

const ownDriver = { findUnique: jest.fn().mockResolvedValue({ userId: ME }) };
const foreignDriver = {
  findUnique: jest.fn().mockResolvedValue({ userId: OTHER }),
};

describe('Movilidad fase 7: el sujeto es quien tiene la sesión', () => {
  describe('preferencias', () => {
    it('pasajero: solo su propio userId', async () => {
      const upsert = jest.fn();
      const findUnique = jest.fn().mockResolvedValue({ id: 'p1' });
      const service = build({
        mobilityExperiencePreference: { findUnique, upsert, create: jest.fn() },
      });

      await expect(
        service.preferenceFor(ME, 'PASSENGER', OTHER),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findUnique).not.toHaveBeenCalled();

      await expect(service.preferenceFor(ME, 'PASSENGER', ME)).resolves.toEqual(
        {
          id: 'p1',
        },
      );
    });

    it('conductor: solo el perfil que le pertenece', async () => {
      const findUnique = jest.fn().mockResolvedValue({ id: 'p1' });
      const prefs = { findUnique, create: jest.fn() };

      await expect(
        build({
          mobilityDriver: foreignDriver,
          mobilityExperiencePreference: prefs,
        }).preferenceFor(ME, 'DRIVER', 'driver-ajeno'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findUnique).not.toHaveBeenCalled();

      await expect(
        build({
          mobilityDriver: ownDriver,
          mobilityExperiencePreference: prefs,
        }).preferenceFor(ME, 'DRIVER', 'driver-propio'),
      ).resolves.toEqual({ id: 'p1' });
    });

    it('un conductor inexistente se trata igual que uno ajeno', async () => {
      const service = build({
        mobilityDriver: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.preferenceFor(ME, 'DRIVER', 'no-existe'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza tipos de sujeto desconocidos', async () => {
      await expect(
        build({}).preferenceFor(ME, 'ADMIN', ME),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no modifica preferencias de otra persona', async () => {
      const upsert = jest.fn();
      const service = build({
        mobilityExperiencePreference: { upsert },
      });
      await expect(
        service.updatePreference(ME, {
          subjectType: 'PASSENGER',
          subjectId: OTHER,
          voiceEnabled: false,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('viaje rápido', () => {
    it('no permite pedir un viaje a nombre de otro pasajero', async () => {
      const createNegotiation = jest.fn();
      const service = build({}, { createNegotiation });
      await expect(
        service.quickRide(ME, {
          passengerUserId: OTHER,
          originAddress: 'a',
          originLat: 19.7,
          originLng: -101.2,
          destinationAddress: 'b',
          destinationLat: 19.71,
          destinationLng: -101.19,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(createNegotiation).not.toHaveBeenCalled();
    });
  });

  describe('voz', () => {
    const command = (subjectType: string, subjectId: string) => ({
      id: 'c1',
      subjectType,
      subjectId,
      status: 'CONFIRMATION_REQUIRED',
      requiresConfirmation: true,
      expiresAt: new Date(Date.now() + 60_000),
      intent: 'CHANGE_PASSENGER_OFFER',
    });

    it('no confirma el comando de otra persona (ni revela que existe)', async () => {
      const updateMany = jest.fn();
      const update = jest.fn();
      const passengerOffer = jest.fn();
      const service = build(
        {
          mobilityVoiceCommand: {
            findUnique: jest
              .fn()
              .mockResolvedValueOnce(command('PASSENGER', OTHER))
              .mockResolvedValueOnce(null),
            updateMany,
            update,
          },
        },
        { passengerOffer },
      );

      const ajeno = service.confirm(ME, 'c1', { confirm: true });
      await expect(ajeno).rejects.toBeInstanceOf(NotFoundException);
      await expect(ajeno).rejects.toThrow('Comando no encontrado.');

      await expect(
        service.confirm(ME, 'no-existe', { confirm: true }),
      ).rejects.toThrow('Comando no encontrado.');

      expect(updateMany).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(passengerOffer).not.toHaveBeenCalled();
    });

    it('un conductor no confirma comandos de otro conductor', async () => {
      const updateMany = jest.fn();
      const service = build({
        mobilityDriver: foreignDriver,
        mobilityVoiceCommand: {
          findUnique: jest
            .fn()
            .mockResolvedValue(command('DRIVER', 'driver-x')),
          updateMany,
        },
      });
      await expect(
        service.confirm(ME, 'c1', { confirm: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('interpret exige que el sujeto sea la sesión', async () => {
      const create = jest.fn();
      const service = build({ mobilityVoiceCommand: { create } });
      await expect(
        service.interpret(ME, {
          subjectType: 'PASSENGER',
          subjectId: OTHER,
          text: 'pide un viaje',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });

    it('interpret no acepta un requestId de otro pasajero', async () => {
      const create = jest.fn();
      const service = build({
        mobilityNegotiationRequest: {
          findUnique: jest.fn().mockResolvedValue({ passengerUserId: OTHER }),
        },
        mobilityVoiceCommand: { create },
      });
      await expect(
        service.interpret(ME, {
          subjectType: 'PASSENGER',
          subjectId: ME,
          text: 'cambia mi oferta a 80',
          requestId: 'req-ajeno',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });

    it('interpret no acepta passengerUserId ni driverId distintos al sujeto', async () => {
      const service = build({ mobilityDriver: ownDriver });
      await expect(
        service.interpret(ME, {
          subjectType: 'PASSENGER',
          subjectId: ME,
          text: 'hola',
          passengerUserId: OTHER,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.interpret(ME, {
          subjectType: 'DRIVER',
          subjectId: 'driver-propio',
          text: 'hola',
          driverId: 'driver-ajeno',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
