import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createCategory(
    dto: CreateCategoryDto,
  ) {
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

    const existing =
      await this.prisma.productCategory.findFirst({
        where: {
          companyId: dto.companyId,
          name: dto.name.trim(),
        },
      });

    if (existing) {
      throw new ConflictException(
        'Ya existe una categoría con este nombre',
      );
    }

    return this.prisma.productCategory.create({
      data: {
        name: dto.name.trim(),
        description:
          dto.description?.trim(),
        sortOrder: dto.sortOrder ?? 0,
        companyId: dto.companyId,
      },
    });
  }

  async findCategoriesByCompany(
    companyId: string,
  ) {
    const company =
      await this.prisma.company.findUnique({
        where: {
          id: companyId,
        },
      });

    if (!company) {
      throw new NotFoundException(
        'La empresa no existe',
      );
    }

    return this.prisma.productCategory.findMany({
      where: {
        companyId,
      },
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async createProduct(
    dto: CreateProductDto,
  ) {
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

    if (dto.categoryId) {
      const category =
        await this.prisma.productCategory.findUnique({
          where: {
            id: dto.categoryId,
          },
        });

      if (!category) {
        throw new NotFoundException(
          'La categoría no existe',
        );
      }

      if (
        category.companyId !==
        dto.companyId
      ) {
        throw new BadRequestException(
          'La categoría no pertenece a esta empresa',
        );
      }
    }

    if (dto.sku?.trim()) {
      const existingSku =
        await this.prisma.product.findFirst({
          where: {
            companyId: dto.companyId,
            sku: dto.sku.trim(),
          },
        });

      if (existingSku) {
        throw new ConflictException(
          'Ya existe un producto con este SKU',
        );
      }
    }

    let seasonStartsAt:
      | Date
      | undefined;

    let seasonEndsAt:
      | Date
      | undefined;

    if (dto.seasonStartsAt) {
      seasonStartsAt = new Date(
        dto.seasonStartsAt,
      );
    }

    if (dto.seasonEndsAt) {
      seasonEndsAt = new Date(
        dto.seasonEndsAt,
      );
    }

    if (
      seasonStartsAt &&
      seasonEndsAt &&
      seasonEndsAt <= seasonStartsAt
    ) {
      throw new BadRequestException(
        'La fecha final de temporada debe ser posterior a la fecha inicial',
      );
    }

    return this.prisma.product.create({
      data: {
        name: dto.name.trim(),

        description:
          dto.description?.trim(),

        type:
          dto.type ?? 'product',

        sku:
          dto.sku?.trim(),

        price: dto.price,

        compareAtPrice:
          dto.compareAtPrice,

        trackInventory:
          dto.trackInventory ?? true,

        stock:
          dto.stock ?? 0,

        lowStockAt:
          dto.lowStockAt ?? 5,

        featured:
          dto.featured ?? false,

        seasonal:
          dto.seasonal ?? false,

        seasonStartsAt,
        seasonEndsAt,

        companyId:
          dto.companyId,

        categoryId:
          dto.categoryId,
      },

      include: {
        category: true,
        variants: true,
        images: true,
      },
    });
  }

  async findProductsByCompany(
    companyId: string,
  ) {
    const company =
      await this.prisma.company.findUnique({
        where: {
          id: companyId,
        },
      });

    if (!company) {
      throw new NotFoundException(
        'La empresa no existe',
      );
    }

    return this.prisma.product.findMany({
      where: {
        companyId,
      },

      include: {
        category: true,
        variants: true,
        images: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findProduct(id: string) {
    const product =
      await this.prisma.product.findUnique({
        where: {
          id,
        },

        include: {
          company: true,
          category: true,
          variants: true,
          images: true,
        },
      });

    if (!product) {
      throw new NotFoundException(
        'El producto no existe',
      );
    }

    return product;
  }

  async addVariant(
    productId: string,
    dto: CreateVariantDto,
  ) {
    const product =
      await this.prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    if (!product) {
      throw new NotFoundException(
        'El producto no existe',
      );
    }

    if (dto.sku?.trim()) {
      const existing =
        await this.prisma.productVariant.findFirst({
          where: {
            productId,
            sku: dto.sku.trim(),
          },
        });

      if (existing) {
        throw new ConflictException(
          'Ya existe una variante con este SKU',
        );
      }
    }

    return this.prisma.productVariant.create({
      data: {
        name: dto.name.trim(),

        sku:
          dto.sku?.trim(),

        price:
          dto.price,

        stock:
          dto.stock ?? 0,

        attributes:
          dto.attributes,

        productId,
      },
    });
  }

  async addImage(
    productId: string,
    dto: CreateImageDto,
  ) {
    const product =
      await this.prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    if (!product) {
      throw new NotFoundException(
        'El producto no existe',
      );
    }

    if (dto.isPrimary) {
      return this.prisma.$transaction(
        async (tx) => {
          await tx.productImage.updateMany({
            where: {
              productId,
              isPrimary: true,
            },
            data: {
              isPrimary: false,
            },
          });

          return tx.productImage.create({
            data: {
              url: dto.url.trim(),

              altText:
                dto.altText?.trim(),

              sortOrder:
                dto.sortOrder ?? 0,

              isPrimary: true,

              productId,
            },
          });
        },
      );
    }

    return this.prisma.productImage.create({
      data: {
        url: dto.url.trim(),

        altText:
          dto.altText?.trim(),

        sortOrder:
          dto.sortOrder ?? 0,

        isPrimary: false,

        productId,
      },
    });
  }

  async updateProductStock(
    productId: string,
    dto: UpdateStockDto,
  ) {
    const product =
      await this.prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    if (!product) {
      throw new NotFoundException(
        'El producto no existe',
      );
    }

    if (!product.trackInventory) {
      throw new BadRequestException(
        'Este producto no controla inventario',
      );
    }

    return this.prisma.product.update({
      where: {
        id: productId,
      },

      data: {
        stock: dto.stock,
      },
    });
  }

  async updateVariantStock(
    variantId: string,
    dto: UpdateStockDto,
  ) {
    const variant =
      await this.prisma.productVariant.findUnique({
        where: {
          id: variantId,
        },
      });

    if (!variant) {
      throw new NotFoundException(
        'La variante no existe',
      );
    }

    return this.prisma.productVariant.update({
      where: {
        id: variantId,
      },

      data: {
        stock: dto.stock,
      },
    });
  }
}