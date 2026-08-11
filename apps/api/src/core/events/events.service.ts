import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.event.findMany({
      orderBy: {
        occurredAt: 'desc',
      },
      take: 100,
    });
  }

  async create(createEventDto: CreateEventDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createEventDto.companyId,
      },
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