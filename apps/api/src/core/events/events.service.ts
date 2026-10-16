import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    if (!companyId?.trim()) {
      throw new ForbiddenException('Falta el contexto de empresa');
    }

    return this.prisma.event.findMany({
      where: { companyId },
      select: {
        id: true,
        type: true,
        source: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  // Metodo legado: solo uso interno.
  // En I2 se sustituira por un publicador seguro.

  async create(createEventDto: CreateEventDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: createEventDto.companyId },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.event.create({
      data: {
        type: createEventDto.type.trim().toLowerCase(),
        source: createEventDto.source?.trim(),
        entityType: createEventDto.entityType?.trim(),
        entityId: createEventDto.entityId?.trim(),
        data: createEventDto.data as Prisma.InputJsonValue,
        companyId: createEventDto.companyId,
      },
    });
  }
}
