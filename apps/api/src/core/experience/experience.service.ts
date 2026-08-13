import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.experience.findMany({
      include: {
        incident: true,
        selectedAlternative: true,
      },
      orderBy: {
        verifiedAt: 'desc',
      },
    });
  }
}