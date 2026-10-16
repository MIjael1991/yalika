import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { platformOperatorIds } from '../auth/platform-operator.guard';
import type { AuthContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MobilityPinService } from './mobility-pin.service';

export type TripRole = 'PASSENGER' | 'DRIVER' | 'OPERATOR';

/**
 * Reglas de pertenencia de Movilidad. Una persona solo puede tocar lo suyo:
 * su propio usuario, su propio perfil de conductor y los viajes en los que
 * participa. El operador de la plataforma puede revisar todo.
 */
@Injectable()
export class MobilityAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pins: MobilityPinService,
  ) {}

  isOperator(auth: AuthContext) {
    return platformOperatorIds().has(auth.user.id);
  }

  /** Devuelve el usuario de la sesión; si se pidió otro, solo el operador puede. */
  selfUser(auth: AuthContext, claimedUserId?: string | null) {
    if (
      claimedUserId &&
      claimedUserId !== auth.user.id &&
      !this.isOperator(auth)
    ) {
      throw new ForbiddenException('Solo puedes usar tu propia cuenta.');
    }

    return claimedUserId ?? auth.user.id;
  }

  /** El perfil de conductor debe ser del usuario de la sesión. */
  async driverAccess(auth: AuthContext, driverId: string) {
    if (this.isOperator(auth)) return;

    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: driverId },
      select: { userId: true },
    });

    if (!driver || driver.userId !== auth.user.id) {
      throw new ForbiddenException('Ese perfil de conductor no es tuyo.');
    }
  }

  /** La sesión debe pertenecer al pasajero o al conductor del viaje. */
  async tripAccess(auth: AuthContext, tripId: string): Promise<TripRole> {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
      select: {
        passengerUserId: true,
        driver: { select: { userId: true } },
      },
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.passengerUserId === auth.user.id) return 'PASSENGER';
    if (trip.driver?.userId === auth.user.id) return 'DRIVER';
    if (this.isOperator(auth)) return 'OPERATOR';

    throw new ForbiddenException('Este viaje no es tuyo.');
  }

  /**
   * Quien dice ser (pasajero o conductor) debe ser la persona de la sesión.
   * Cualquier otro tipo de actor (sistema, soporte) solo lo usa el operador.
   */
  async actorIdentity(auth: AuthContext, actorType: string, actorId: string) {
    if (this.isOperator(auth)) return;

    const type = actorType.toUpperCase();

    if (type === 'PASSENGER' && actorId === auth.user.id) return;

    if (type === 'DRIVER') {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { id: actorId },
        select: { userId: true },
      });
      if (driver?.userId === auth.user.id) return;
    }

    throw new ForbiddenException('Solo puedes actuar con tu propia cuenta.');
  }

  /** El vehículo debe pertenecer al conductor indicado. */
  async vehicleOfDriver(vehicleId: string, driverId: string) {
    const vehicle = await this.prisma.mobilityVehicle.findUnique({
      where: { id: vehicleId },
      select: { driverId: true },
    });

    if (!vehicle || vehicle.driverId !== driverId) {
      throw new ForbiddenException('Ese vehículo no pertenece al conductor.');
    }
  }

  /** El rastreador debe pertenecer a un conductor de la sesión. */
  async trackerAccess(auth: AuthContext, trackerId: string) {
    const tracker = await this.prisma.mobilityVehicleTracker.findUnique({
      where: { id: trackerId },
      select: { driverId: true },
    });

    if (!tracker) throw new NotFoundException('Rastreador no encontrado');
    await this.driverAccess(auth, tracker.driverId);
  }

  /** El caso de objeto olvidado es de los participantes del viaje. */
  async lostItemAccess(auth: AuthContext, lostItemId: string) {
    const item = await this.prisma.mobilityLostItemCase.findUnique({
      where: { id: lostItemId },
      select: { tripId: true },
    });

    if (!item) throw new NotFoundException('Caso no encontrado');
    return this.tripAccess(auth, item.tripId);
  }

  /**
   * Una calificación solo la da un participante del viaje, con su propia
   * cuenta, y solo a la otra parte del mismo viaje.
   */
  async ratingParticipants(
    auth: AuthContext,
    tripId: string,
    dto: {
      authorType: string;
      authorId: string;
      targetType: string;
      targetId: string;
    },
  ) {
    await this.tripAccess(auth, tripId);
    await this.actorIdentity(auth, dto.authorType, dto.authorId);

    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
      select: { passengerUserId: true, driverId: true },
    });
    const author = dto.authorType.toUpperCase();
    const target = dto.targetType.toUpperCase();

    const validPassengerRates =
      author === 'PASSENGER' &&
      target === 'DRIVER' &&
      dto.targetId === trip?.driverId;
    const validDriverRates =
      author === 'DRIVER' &&
      target === 'PASSENGER' &&
      dto.targetId === trip?.passengerUserId;

    if (!validPassengerRates && !validDriverRates && !this.isOperator(auth)) {
      throw new ForbiddenException(
        'Solo puedes calificar a la otra parte de tu viaje.',
      );
    }
  }

  /** El vehículo debe pertenecer a un conductor de la sesión. */
  async vehicleAccess(auth: AuthContext, vehicleId: string) {
    const vehicle = await this.prisma.mobilityVehicle.findUnique({
      where: { id: vehicleId },
      select: { driverId: true },
    });

    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    await this.driverAccess(auth, vehicle.driverId);
  }

  /** El viaje seguro es del pasajero que lo creó o del conductor indicado. */
  async safeRideAccess(auth: AuthContext, safeRideId: string) {
    const ride = await this.prisma.mobilitySafeRide.findUnique({
      where: { id: safeRideId },
      select: { passengerUserId: true, driverId: true },
    });

    if (!ride) throw new NotFoundException('Viaje seguro no encontrado');
    if (ride.passengerUserId === auth.user.id) return;
    if (this.isOperator(auth)) return;

    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { id: ride.driverId },
      select: { userId: true },
    });
    if (driver?.userId === auth.user.id) return;

    throw new ForbiddenException('Este viaje seguro no es tuyo.');
  }

  /** Solo quien pidió la negociación (o el operador) la administra. */
  async negotiationOwner(auth: AuthContext, requestId: string) {
    const request = await this.prisma.mobilityNegotiationRequest.findUnique({
      where: { id: requestId },
      select: { passengerUserId: true },
    });

    if (!request) throw new NotFoundException('Negociación no encontrada');
    if (request.passengerUserId === auth.user.id || this.isOperator(auth)) {
      return;
    }

    throw new ForbiddenException('Esta negociación no es tuya.');
  }

  /** La ven quien la pidió y los conductores registrados (para contraofertar). */
  async negotiationVisible(auth: AuthContext, requestId: string) {
    const request = await this.prisma.mobilityNegotiationRequest.findUnique({
      where: { id: requestId },
      select: { passengerUserId: true },
    });

    if (!request) throw new NotFoundException('Negociación no encontrada');
    if (request.passengerUserId === auth.user.id || this.isOperator(auth)) {
      return;
    }

    const driver = await this.prisma.mobilityDriver.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (driver) return;

    throw new ForbiddenException('Esta negociación no es tuya.');
  }

  /**
   * Quién puede ver un viaje: su pasajero, su conductor, el operador y,
   * mientras se negocia, los conductores registrados (para poder ofertar).
   */
  async tripView(
    auth: AuthContext,
    tripId: string,
  ): Promise<TripRole | 'CANDIDATE'> {
    const trip = await this.prisma.mobilityTrip.findUnique({
      where: { id: tripId },
      select: {
        status: true,
        passengerUserId: true,
        driver: { select: { userId: true } },
      },
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado.');
    if (trip.passengerUserId === auth.user.id) return 'PASSENGER';
    if (trip.driver?.userId === auth.user.id) return 'DRIVER';
    if (this.isOperator(auth)) return 'OPERATOR';

    if (['REQUESTED', 'NEGOTIATING'].includes(trip.status)) {
      const driver = await this.prisma.mobilityDriver.findUnique({
        where: { userId: auth.user.id },
        select: { id: true },
      });
      if (driver) return 'CANDIDATE';
    }

    throw new ForbiddenException('Este viaje no es tuyo.');
  }

  /**
   * El PIN de seguridad solo lo conoce el pasajero. En la base solo hay una
   * marca; al pasajero se le muestra el PIN real, calculado por el servidor.
   */
  hidePin<T extends { id?: string; safetyPin?: unknown }>(
    trip: T,
    role: TripRole | 'CANDIDATE',
  ): T {
    if (role === 'PASSENGER' || role === 'OPERATOR') {
      if (typeof trip.id === 'string' && typeof trip.safetyPin === 'string') {
        return {
          ...trip,
          safetyPin: this.pins.reveal({
            id: trip.id,
            safetyPin: trip.safetyPin,
          }),
        };
      }
      return trip;
    }

    const { safetyPin: _hidden, ...rest } = trip;
    void _hidden;
    return rest as T;
  }
}
