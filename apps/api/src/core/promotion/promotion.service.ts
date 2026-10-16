import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';

@Injectable()
export class PromotionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePromotionDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: dto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha final debe ser posterior a la fecha inicial',
      );
    }

    if (
      dto.type === 'percentage' &&
      (dto.discountValue === undefined ||
        dto.discountValue <= 0 ||
        dto.discountValue > 100)
    ) {
      throw new BadRequestException(
        'El porcentaje debe ser mayor a 0 y máximo 100',
      );
    }

    if (
      dto.type === 'fixed' &&
      (dto.discountValue === undefined || dto.discountValue <= 0)
    ) {
      throw new BadRequestException('El descuento debe ser mayor a 0');
    }

    if (dto.type === 'special_price' && dto.specialPrice === undefined) {
      throw new BadRequestException('La promoción necesita un precio especial');
    }

    if (dto.type === 'buy_x_get_y' && (!dto.buyQuantity || !dto.getQuantity)) {
      throw new BadRequestException(
        'La promoción necesita cantidad de compra y cantidad de regalo',
      );
    }

    const productIds = dto.productIds ?? [];

    if (dto.type === 'buy_x_get_y' && productIds.length !== 1) {
      throw new BadRequestException(
        'Compra X y recibe Y debe aplicarse a un solo producto',
      );
    }

    if (productIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: {
          id: {
            in: productIds,
          },
          companyId: dto.companyId,
        },
        select: {
          id: true,
        },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException(
          'Uno o más productos no pertenecen a esta empresa',
        );
      }
    }

    return this.prisma.promotion.create({
      data: {
        title: dto.title.trim(),

        description: dto.description?.trim(),

        type: dto.type,

        scope: productIds.length > 0 ? 'selected_products' : 'all',

        discountValue: dto.discountValue,

        specialPrice: dto.specialPrice,

        minimumPurchase: dto.minimumPurchase,

        buyQuantity: dto.buyQuantity,

        getQuantity: dto.getQuantity,

        rewardDescription: dto.rewardDescription?.trim(),

        imageUrl: dto.imageUrl?.trim(),

        featured: dto.featured ?? false,

        status: 'draft',

        startsAt,
        endsAt,

        companyId: dto.companyId,

        products:
          productIds.length > 0
            ? {
                create: productIds.map((productId) => ({
                  productId,
                })),
              }
            : undefined,
      },

      include: {
        products: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async findByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.promotion.findMany({
      where: {
        companyId,
      },

      include: {
        products: {
          include: {
            product: {
              include: {
                images: true,
                variants: true,
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findPublicByCompany(companyId: string) {
    const published = await this.prisma.site.findFirst({
        where: { companyId, isPrimary: true },
      select: { status: true },
    });
    if (published?.status !== 'published') {
      throw new NotFoundException('El escaparate no está publicado');
    }
    const now = new Date();

    return this.prisma.promotion.findMany({
      where: {
        companyId,
        status: 'active',
        startsAt: {
          lte: now,
        },
        endsAt: {
          gte: now,
        },
      },

      include: {
        products: {
          include: {
            product: {
              include: {
                images: true,
                variants: true,
              },
            },
          },
        },
      },

      orderBy: [
        {
          featured: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: {
        id,
      },

      include: {
        company: true,

        products: {
          include: {
            product: {
              include: {
                images: true,
                variants: true,
              },
            },
          },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException('La promoción no existe');
    }

    return promotion;
  }

  async activate(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: {
        id,
      },
    });

    if (!promotion) {
      throw new NotFoundException('La promoción no existe');
    }

    if (promotion.status === 'closed') {
      throw new BadRequestException(
        'Una promoción cerrada no puede volver a activarse',
      );
    }

    if (new Date() > promotion.endsAt) {
      throw new BadRequestException('La promoción ya terminó su vigencia');
    }

    return this.prisma.promotion.update({
      where: {
        id,
      },

      data: {
        status: 'active',
      },
    });
  }

  async pause(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: {
        id,
      },
    });

    if (!promotion) {
      throw new NotFoundException('La promoción no existe');
    }

    if (promotion.status !== 'active') {
      throw new BadRequestException('Solo una promoción activa puede pausarse');
    }

    return this.prisma.promotion.update({
      where: {
        id,
      },

      data: {
        status: 'paused',
      },
    });
  }

  async close(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: {
        id,
      },
    });

    if (!promotion) {
      throw new NotFoundException('La promoción no existe');
    }

    if (promotion.status === 'closed') {
      return promotion;
    }

    return this.prisma.promotion.update({
      where: {
        id,
      },

      data: {
        status: 'closed',
        closedAt: new Date(),
      },
    });
  }

  async removeDraft(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: {
        id,
      },
    });

    if (!promotion) {
      throw new NotFoundException('La promoción no existe');
    }

    if (promotion.status !== 'draft') {
      throw new BadRequestException(
        'Solo se pueden eliminar promociones que nunca han sido publicadas',
      );
    }

    await this.prisma.promotion.delete({
      where: {
        id,
      },
    });

    return {
      deleted: true,
      id,
    };
  }
}
