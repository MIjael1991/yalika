import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SiteService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateSiteDto) {
    const company =
      await this.prisma.company.findUnique({
        where: {
          id: dto.companyId,
        },
      });

    if (!company) {
      throw new NotFoundException(
        'La empresa no existe',
      );
    }

    const existingCompanySite =
      await this.prisma.site.findUnique({
        where: {
          companyId: dto.companyId,
        },
      });

    if (existingCompanySite) {
      throw new ConflictException(
        'Esta empresa ya tiene un sitio',
      );
    }

    const existingSlug =
      await this.prisma.site.findUnique({
        where: {
          slug: dto.slug,
        },
      });

    if (existingSlug) {
      throw new ConflictException(
        'Esta dirección ya está siendo utilizada',
      );
    }

    return this.prisma.site.create({
      data: {
        name: dto.name.trim(),
        slug: dto.slug.trim(),

        template:
          dto.template ?? 'hero',

        primaryColor:
          dto.primaryColor,

        accentColor:
          dto.accentColor,

        backgroundType:
          dto.backgroundType ?? 'color',

        backgroundValue:
          dto.backgroundValue,

        logoUrl:
          dto.logoUrl,

        heroImageUrl:
          dto.heroImageUrl,

        heroTitle:
          dto.heroTitle?.trim(),

        heroSubtitle:
          dto.heroSubtitle?.trim(),

        heroButtonText:
          dto.heroButtonText?.trim(),

        heroButtonUrl:
          dto.heroButtonUrl,

        companyId:
          dto.companyId,

        sections: {
          create: [
            {
              type: 'hero',
              sortOrder: 0,
            },
            {
              type: 'promotions',
              title: 'Promociones',
              sortOrder: 10,
            },
            {
              type: 'catalog',
              title: 'Catálogo',
              sortOrder: 20,
            },
            {
              type: 'loyalty',
              title: 'Recompensas',
              sortOrder: 30,
            },
            {
              type: 'location',
              title: 'Ubicación',
              sortOrder: 40,
            },
            {
              type: 'contact',
              title: 'Contacto',
              sortOrder: 50,
            },
          ],
        },
      },

      include: {
        sections: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });
  }

  async findByCompany(
    companyId: string,
  ) {
    const site =
      await this.prisma.site.findUnique({
        where: {
          companyId,
        },

        include: {
          sections: {
            orderBy: {
              sortOrder: 'asc',
            },
          },
        },
      });

    if (!site) {
      throw new NotFoundException(
        'La empresa todavía no tiene sitio',
      );
    }

    return site;
  }

  async findPublic(slug: string) {
    const site =
      await this.prisma.site.findUnique({
        where: {
          slug,
        },

        include: {
          company: true,

          sections: {
            where: {
              enabled: true,
            },

            orderBy: {
              sortOrder: 'asc',
            },
          },
        },
      });

    if (!site) {
      throw new NotFoundException(
        'El sitio no existe',
      );
    }

    return site;
  }

  async publish(id: string) {
    const site =
      await this.prisma.site.findUnique({
        where: {
          id,
        },
      });

    if (!site) {
      throw new NotFoundException(
        'El sitio no existe',
      );
    }

    return this.prisma.site.update({
      where: {
        id,
      },

      data: {
        status: 'published',
        publishedAt: new Date(),
      },
    });
  }
}