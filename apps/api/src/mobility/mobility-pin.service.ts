import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { MobilityTripStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Marca guardada en lugar del PIN: el PIN real se calcula, no se almacena. */
export const DERIVED_PIN_MARKER = 'derived:v1';
/** Prefijo de los PIN de viaje seguro protegidos con la clave del servidor. */
const DIGEST_PREFIX = 'h1:';

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;

/** Estados en los que el viaje ya inició o terminó: el PIN ya no se necesita. */
const AFTER_START: MobilityTripStatus[] = [
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

function pinSecret() {
  const secret = process.env.YALIKA_PIN_SECRET ?? process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta YALIKA_PIN_SECRET para proteger los PIN de viaje');
  }

  return 'yalika-clave-local-solo-para-desarrollo';
}

function sameText(a: string, b: string) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function isLegacyPlainPin(value: string) {
  return /^\d{4}$/.test(value);
}

/**
 * PIN de seguridad de Movilidad.
 *
 * - Viaje normal: el PIN de 4 dígitos se calcula con una clave del servidor
 *   a partir del id del viaje. En la base solo queda una marca, así que una
 *   copia de la base no revela ningún PIN. El pasajero lo ve porque el
 *   servidor lo vuelve a calcular.
 * - Viaje seguro: se guarda un código con esa misma clave (no el PIN).
 * - Todos los intentos comparten el mismo límite: 5 fallos cada 10 minutos.
 */
@Injectable()
export class MobilityPinService implements OnModuleInit {
  private readonly logger = new Logger(MobilityPinService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Los viajes viejos con PIN en texto, que ya no lo necesitan, se limpian al arrancar. */
  async onModuleInit() {
    try {
      const { count } = await this.prisma.mobilityTrip.updateMany({
        where: {
          safetyPin: { not: DERIVED_PIN_MARKER },
          status: { in: AFTER_START },
        },
        data: { safetyPin: DERIVED_PIN_MARKER },
      });
      if (count > 0) {
        this.logger.log(`PIN en texto retirados de ${count} viajes.`);
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo limpiar los PIN antiguos: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** PIN de 4 dígitos del viaje, derivado de la clave del servidor. */
  derivePin(tripId: string) {
    const digest = createHmac('sha256', pinSecret())
      .update(`trip-pin:${tripId}`)
      .digest();
    return String(1000 + (digest.readUInt32BE(0) % 9000));
  }

  /** Lo que se guarda al crear un viaje. */
  storedMarker() {
    return DERIVED_PIN_MARKER;
  }

  /** El PIN que debe ver el pasajero (los viajes antiguos conservan el suyo). */
  reveal(trip: { id: string; safetyPin: string }) {
    return isLegacyPlainPin(trip.safetyPin)
      ? trip.safetyPin
      : this.derivePin(trip.id);
  }

  /** ¿Coincide el PIN escrito con el del viaje? */
  matchesTrip(trip: { id: string; safetyPin: string }, candidate: string) {
    return sameText(this.reveal(trip), candidate);
  }

  /** Código que se guarda del PIN de un viaje seguro. */
  safeRideDigest(rideId: string, pin: string) {
    return (
      DIGEST_PREFIX +
      createHmac('sha256', pinSecret())
        .update(`safe-ride:${rideId}:${pin}`)
        .digest('hex')
    );
  }

  /** Compara con el código nuevo y, por compatibilidad, con el antiguo (sha256 sin clave). */
  matchesSafeRide(
    ride: { id: string; safetyPinHash: string },
    candidate: string,
  ) {
    if (ride.safetyPinHash.startsWith(DIGEST_PREFIX)) {
      return sameText(
        ride.safetyPinHash,
        this.safeRideDigest(ride.id, candidate),
      );
    }

    return sameText(
      ride.safetyPinHash,
      createHash('sha256').update(candidate).digest('hex'),
    );
  }

  isLegacySafeRideDigest(hash: string) {
    return !hash.startsWith(DIGEST_PREFIX);
  }

  /**
   * Cuenta el intento y aplica el límite. Si ya hubo demasiados fallos
   * responde 429 sin siquiera comparar el PIN.
   */
  async attempt(
    subjectId: string,
    isCorrect: () => boolean,
    actor: {
      passengerUserId?: string | null;
      driverId?: string | null;
      source?: string;
    } = {},
  ) {
    const source = actor.source ?? 'APP';
    const since = new Date(Date.now() - WINDOW_MS);
    const failures = await this.prisma.mobilityPinAttempt.count({
      where: {
        tripId: subjectId,
        source,
        success: false,
        createdAt: { gte: since },
      },
    });

    if (failures >= MAX_FAILURES) {
      throw new HttpException(
        'Demasiados intentos de PIN. Espera antes de volver a intentar.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const success = isCorrect();

    await this.prisma.mobilityPinAttempt.create({
      data: {
        tripId: subjectId,
        passengerUserId: actor.passengerUserId ?? undefined,
        driverId: actor.driverId ?? undefined,
        success,
        source,
      },
    });

    return {
      success,
      attemptsRemaining: success
        ? MAX_FAILURES
        : Math.max(0, MAX_FAILURES - 1 - failures),
    };
  }
}
