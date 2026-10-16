import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.experience.findMany({
      where: { companyId },
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
