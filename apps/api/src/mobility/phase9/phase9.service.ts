import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RecordTripPlacesDto,
  SavePlaceDto,
  UpdatePlaceDto,
  UpdatePremiumPreferenceDto,
} from './phase9.dto';

@Injectable()
export class MobilityPhase9Service {
  constructor(private readonly prisma: PrismaService) {}

  private async upsertPlace(data: {
    userId: string;
    label: string;
    kind: string;
    address: string;
    lat: number;
    lng: number;
    isPinned?: boolean;
    source: string;
    scoreAdd?: number;
  }) {
    const existing = await this.prisma.mobilitySavedPlace.findUnique({
      where: {
        userId_address: {
          userId: data.userId,
          address: data.address,
        },
      },
    });

    if (existing) {
      return this.prisma.mobilitySavedPlace.update({
        where: { id: existing.id },
        data: {
          // Aprender un viaje nunca sobreescribe etiquetas Casa/Trabajo manuales.
          label:
            existing.source === 'MANUAL' && data.source === 'TRIP'
              ? existing.label
              : data.label || existing.label,
          kind:
            existing.source === 'MANUAL' && data.source === 'TRIP'
              ? existing.kind
              : data.kind || existing.kind,
          lat: data.lat,
          lng: data.lng,
          isPinned: data.isPinned ?? existing.isPinned,
          source:
            existing.source === 'MANUAL' && data.source === 'TRIP'
              ? existing.source
              : data.source,
          visits: { increment: data.source === 'TRIP' ? 1 : 0 },
          score: {
            increment: data.source === 'TRIP' ? (data.scoreAdd ?? 1) : 0,
          },
          lastUsedAt: new Date(),
          isActive: true,
        },
      });
    }

    return this.prisma.mobilitySavedPlace.create({
      data: {
        userId: data.userId,
        label: data.label,
        kind: data.kind,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        isPinned: data.isPinned ?? false,
        source: data.source,
        visits: data.source === 'TRIP' ? 1 : 0,
        score: data.scoreAdd ?? 1,
        lastUsedAt: new Date(),
      },
    });
  }

  async savePlace(dto: SavePlaceDto) {
    return this.upsertPlace({
      userId: dto.userId,
      label: dto.label,
      kind: dto.kind ?? 'CUSTOM',
      address: dto.address,
      lat: Number(dto.lat),
      lng: Number(dto.lng),
      isPinned: dto.isPinned,
      source: 'MANUAL',
      scoreAdd: 3,
    });
  }

  async recordTrip(dto: RecordTripPlacesDto) {
    // Se exige activacion explicita de la preferencia y viaje COMPLETADO propio.
    // Los datos de ubicacion se toman del viaje persistido, no del body del cliente.
    const preference = await this.prisma.mobilitySearchPreference.findUnique({
      where: { userId: dto.userId },
    });
    if (!preference?.rememberFrequentPlaces) {
      return { ok: false, reason: 'LEARNING_DISABLED' };
    }

    const trip = await this.prisma.mobilityTrip.findFirst({
      where: {
        id: dto.tripId,
        passengerUserId: dto.userId,
        status: 'COMPLETED',
      },
    });
    if (!trip) {
      throw new NotFoundException('Viaje completado propio no encontrado.');
    }

    const recorded = await this.prisma.mobilityTripEvent.findFirst({
      where: { tripId: trip.id, type: 'FREQUENT_PLACES_RECORDED' },
    });
    if (recorded) return { ok: true, alreadyRecorded: true };

    // El ledger evita reintentos secuenciales duplicados. Falta un indice unico
    // para garantizar idempotencia frente a solicitudes concurrentes reales.
    const origin = await this.upsertPlace({
      userId: dto.userId,
      label: 'Origen reciente',
      kind: 'RECENT',
      address: trip.originAddress,
      lat: trip.originLat,
      lng: trip.originLng,
      source: 'TRIP',
      scoreAdd: 1,
    });
    const destination = await this.upsertPlace({
      userId: dto.userId,
      label: 'Destino frecuente',
      kind: 'RECENT',
      address: trip.destinationAddress,
      lat: trip.destinationLat,
      lng: trip.destinationLng,
      source: 'TRIP',
      scoreAdd: 2,
    });

    await this.prisma.mobilitySearchPreference.update({
      where: { userId: dto.userId },
      data: {
        lastDestinationAddress: trip.destinationAddress,
        lastDestinationLat: trip.destinationLat,
        lastDestinationLng: trip.destinationLng,
      },
    });
    await this.prisma.mobilityTripEvent.create({
      data: {
        tripId: trip.id,
        type: 'FREQUENT_PLACES_RECORDED',
        actorType: 'PASSENGER',
        actorId: dto.userId,
        metadata: { source: 'COMPLETED_TRIP', preferenceEnabled: true },
      },
    });
    return { ok: true, origin, destination };
  }

  async frequent(userId: string, limit = 8) {
    const items = await this.prisma.mobilitySavedPlace.findMany({
      where: { userId, isActive: true },
      orderBy: [
        { isPinned: 'desc' },
        { visits: 'desc' },
        { score: 'desc' },
        { lastUsedAt: 'desc' },
      ],
      take: Math.max(
        1,
        Math.min(20, Number.isFinite(limit) ? Math.floor(limit) : 8),
      ),
    });

    return {
      Count: items.length,
      value: items,
      sections: {
        pinned: items.filter((x) => x.isPinned),
        frequent: items.filter((x) => x.visits >= 2),
        recent: items.slice(0, Math.min(items.length, 4)),
      },
    };
  }

  async suggestions(userId: string, q: string) {
    const query = (q ?? '').trim();
    const items = await this.prisma.mobilitySavedPlace.findMany({
      where: {
        userId,
        isActive: true,
        OR: query
          ? [
              { label: { contains: query, mode: 'insensitive' } },
              { address: { contains: query, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: [
        { isPinned: 'desc' },
        { score: 'desc' },
        { lastUsedAt: 'desc' },
      ],
      take: 10,
    });
    return { Count: items.length, value: items };
  }

  async updatePlace(id: string, dto: UpdatePlaceDto, userId: string) {
    const existing = await this.prisma.mobilitySavedPlace.findFirst({
      where: { id, userId, isActive: true },
    });
    if (!existing) throw new NotFoundException('Lugar no encontrado.');
    return this.prisma.mobilitySavedPlace.update({
      where: { id },
      data: {
        label: dto.label,
        kind: dto.kind,
        isPinned: dto.isPinned,
      },
    });
  }

  async removePlace(id: string, userId: string) {
    const existing = await this.prisma.mobilitySavedPlace.findFirst({
      where: { id, userId, isActive: true },
    });
    if (!existing) throw new NotFoundException('Lugar no encontrado.');
    return this.prisma.mobilitySavedPlace.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async updatePreference(dto: UpdatePremiumPreferenceDto) {
    return this.prisma.mobilitySearchPreference.upsert({
      where: { userId: dto.userId },
      create: {
        userId: dto.userId,
        rememberFrequentPlaces: dto.rememberFrequentPlaces ?? false,
        showPremiumUi: dto.showPremiumUi ?? true,
        theme: dto.theme ?? 'PREMIUM_DARK',
        homeLabel: dto.homeLabel,
        workLabel: dto.workLabel,
      },
      update: {
        rememberFrequentPlaces: dto.rememberFrequentPlaces,
        lastDestinationAddress:
          dto.rememberFrequentPlaces === false ? null : undefined,
        lastDestinationLat:
          dto.rememberFrequentPlaces === false ? null : undefined,
        lastDestinationLng:
          dto.rememberFrequentPlaces === false ? null : undefined,
        showPremiumUi: dto.showPremiumUi,
        theme: dto.theme,
        homeLabel: dto.homeLabel,
        workLabel: dto.workLabel,
      },
    });
  }

  async getPreference(userId: string) {
    return this.prisma.mobilitySearchPreference.upsert({
      where: { userId },
      create: { userId, rememberFrequentPlaces: false },
      update: {},
    });
  }
  // Solo se devuelven lugares propios. La respuesta esta acotada para evitar
  // una consulta ilimitada si el usuario tiene un historial extenso.
  async allMine(userId: string) {
    const items = await this.prisma.mobilitySavedPlace.findMany({
      where: { userId, isActive: true },
      orderBy: [{ isPinned: 'desc' }, { lastUsedAt: 'desc' }],
      take: 200,
    });
    return { Count: items.length, value: items, limit: 200 };
  }

  // Eliminacion solicitada con confirmacion expresa; NO borramos viajes ni
  // registros legales/auditoria relacionados con los viajes.
  async deleteAllPlaces(userId: string) {
    const result = await this.prisma.mobilitySavedPlace.deleteMany({
      where: { userId },
    });
    await this.prisma.mobilitySearchPreference.updateMany({
      where: { userId },
      data: {
        rememberFrequentPlaces: false,
        lastDestinationAddress: null,
        lastDestinationLat: null,
        lastDestinationLng: null,
      },
    });
    return { deletedCount: result.count, learningEnabled: false };
  }
}
