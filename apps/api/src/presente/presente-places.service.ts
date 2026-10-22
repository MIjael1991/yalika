import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthContext } from '../auth/auth.types';
import type { PresentePlace } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PlaceDto } from './dto/presente.dto';
import { distanceKm, findMunicipality, MUNICIPALITIES } from './geo/municipios';
import { ACTIVE_JOB } from './presente-job.domain';
import { PresenteStorageService } from './presente-storage.service';
import { MAX_PLACES } from './presente.constants';
import { parseImageDataUrl } from './presente.domain';

const IMAGE_MESSAGES: Record<string, string> = {
  FORMAT: 'La foto debe ser JPG, PNG o WEBP.',
  TOO_SMALL: 'La foto salió muy pequeña o borrosa. Tómala de nuevo.',
  TOO_LARGE: 'La foto es muy pesada. Tómala de nuevo.',
};

/** "Av. Juárez 123, col. Centro" */
export function placeAddress(place: {
  street: string;
  number: string | null;
  neighborhood: string | null;
}) {
  const line = [place.street, place.number].filter(Boolean).join(' ');
  return place.neighborhood ? `${line}, col. ${place.neighborhood}` : line;
}

/** Lo que ve el trabajador elegido para llegar: calle, número y referencia. */
export function placeHint(place: PresentePlace) {
  return [placeAddress(place), place.reference].filter(Boolean).join(' · ');
}

function nearestMunicipalityCode(point: { lat: number; lng: number }) {
  let best: { code: string; km: number } | null = null;
  for (const m of MUNICIPALITIES) {
    const km = distanceKm(point, m);
    if (!best || km < best.km) best = { code: m.code, km };
  }
  return best?.code ?? null;
}

/**
 * Lugares guardados de quien pide ayuda (Casa, Casa de mamá, Oficina...). Se capturan una
 * vez —calle, número, punto exacto, referencia y foto opcional— y al pedir solo se eligen.
 */
@Injectable()
export class PresentePlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PresenteStorageService,
  ) {}

  view(place: PresentePlace) {
    return {
      id: place.id,
      label: place.label,
      street: place.street,
      number: place.number,
      neighborhood: place.neighborhood,
      address: placeAddress(place),
      municipalityCode: place.municipalityCode,
      municipalityName: findMunicipality(place.municipalityCode)?.name ?? null,
      lat: place.lat,
      lng: place.lng,
      reference: place.reference,
      hasPhoto: Boolean(place.photoKey),
    };
  }

  /**
   * Antes había una sola "casa" en los datos del cliente. La primera vez se pasa a un lugar
   * "Casa" (con su foto), para que nadie tenga que volver a capturarla.
   */
  private async adoptOldHome(userId: string) {
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId },
    });
    if (!client || client.homeLat == null || client.homeLng == null) return;
    const municipalityCode = nearestMunicipalityCode({
      lat: client.homeLat,
      lng: client.homeLng,
    });
    if (!municipalityCode) return;
    await this.prisma.$transaction([
      this.prisma.presentePlace.create({
        data: {
          clientUserId: userId,
          label: 'Casa',
          street: '',
          municipalityCode,
          lat: client.homeLat,
          lng: client.homeLng,
          reference: client.homeReference,
          photoKey: client.housePhotoKey,
          photoMime: client.housePhotoMime,
        },
      }),
      this.prisma.presenteClient.update({
        where: { id: client.id },
        data: {
          homeLat: null,
          homeLng: null,
          homeReference: null,
          housePhotoKey: null,
          housePhotoMime: null,
        },
      }),
    ]);
  }

  async list(auth: AuthContext) {
    let places = await this.prisma.presentePlace.findMany({
      where: { clientUserId: auth.user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!places.length) {
      await this.adoptOldHome(auth.user.id);
      places = await this.prisma.presentePlace.findMany({
        where: { clientUserId: auth.user.id },
        orderBy: { createdAt: 'asc' },
      });
    }
    return places.map((place) => this.view(place));
  }

  /** Un lugar propio (o error). */
  async own(auth: AuthContext, id: string) {
    const place = await this.prisma.presentePlace.findUnique({ where: { id } });
    if (!place || place.clientUserId !== auth.user.id) {
      throw new NotFoundException('Lugar no encontrado');
    }
    return place;
  }

  private data(dto: PlaceDto) {
    if (!findMunicipality(dto.municipalityCode)) {
      throw new BadRequestException('Elige el municipio de la lista');
    }
    return {
      label: dto.label.trim(),
      street: dto.street.trim(),
      number: dto.number?.trim() || null,
      neighborhood: dto.neighborhood?.trim() || null,
      municipalityCode: dto.municipalityCode,
      lat: dto.lat,
      lng: dto.lng,
      reference: dto.reference?.trim() || null,
    };
  }

  async create(auth: AuthContext, dto: PlaceDto) {
    const client = await this.prisma.presenteClient.findUnique({
      where: { userId: auth.user.id },
    });
    if (!client) {
      throw new ConflictException('Primero escribe tu nombre en Mis datos');
    }
    const count = await this.prisma.presentePlace.count({
      where: { clientUserId: auth.user.id },
    });
    if (count >= MAX_PLACES) {
      throw new ConflictException(
        `Puedes guardar hasta ${MAX_PLACES} lugares. Borra uno que ya no uses.`,
      );
    }
    const place = await this.prisma.presentePlace.create({
      data: { clientUserId: auth.user.id, ...this.data(dto) },
    });
    return this.view(place);
  }

  async update(auth: AuthContext, id: string, dto: PlaceDto) {
    await this.own(auth, id);
    const place = await this.prisma.presentePlace.update({
      where: { id },
      data: this.data(dto),
    });
    return this.view(place);
  }

  async remove(auth: AuthContext, id: string) {
    const place = await this.own(auth, id);
    const busy = await this.prisma.presenteRequest.count({
      where: {
        placeId: id,
        OR: [
          { status: 'OPEN', expiresAt: { gt: new Date() } },
          { status: { in: ACTIVE_JOB } },
        ],
      },
    });
    if (busy) {
      throw new ConflictException(
        'Este lugar tiene un pedido en curso. Bórralo cuando termine.',
      );
    }
    await this.prisma.presentePlace.delete({ where: { id } });
    if (place.photoKey) await this.storage.delete(place.photoKey);
    return { deleted: true };
  }

  async setPhoto(auth: AuthContext, id: string, dataUrl: string) {
    const place = await this.own(auth, id);
    const image = parseImageDataUrl(dataUrl);
    if (!image.ok) throw new BadRequestException(IMAGE_MESSAGES[image.reason]);
    const key = `private/presente/places/${place.id}/photo-${randomUUID()}.bin`;
    await this.storage.put(key, image.bytes);
    const saved = await this.prisma.presentePlace.update({
      where: { id },
      data: { photoKey: key, photoMime: image.mimeType },
    });
    if (place.photoKey) await this.storage.delete(place.photoKey);
    return this.view(saved);
  }

  async photo(auth: AuthContext, id: string) {
    const place = await this.own(auth, id);
    return this.readPhoto(place);
  }

  async readPhoto(place: Pick<PresentePlace, 'photoKey' | 'photoMime'>) {
    if (!place.photoKey || !place.photoMime) {
      throw new NotFoundException('Este lugar no tiene foto');
    }
    const bytes = await this.storage.get(place.photoKey);
    return {
      dataUrl: `data:${place.photoMime};base64,${bytes.toString('base64')}`,
    };
  }
}
