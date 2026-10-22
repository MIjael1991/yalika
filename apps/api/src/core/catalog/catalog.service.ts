import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  availableQuantity,
  BLOCKING_RESERVATION_STATUSES,
} from '../reservation/reservation-rules';

import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductBarcodeDto } from './dto/barcode.dto';
import {
  buildStockAlerts,
  DEFAULT_ALERT_TIME_ZONE,
  isValidTimeZone,
} from './stock-alerts';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCatalogs(companyId: string) {
    return this.prisma.commerceCatalog.findMany({
      where: { companyId, status: 'active' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createCommerceCatalog(companyId: string, name: string) {
    const normalized = name?.trim();
    if (!normalized || normalized.length > 120) {
      throw new BadRequestException('El nombre del catálogo no es válido');
    }
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('La empresa no existe');
    const existing = await this.prisma.commerceCatalog.findFirst({ where: { companyId, name: normalized } });
    if (existing) throw new ConflictException('Ya existe este catálogo');
    return this.prisma.commerceCatalog.create({ data: { companyId, name: normalized } });
  }

  private async resolveCatalog(companyId: string, desiredId?: string) {
    let catalog = await this.prisma.commerceCatalog.findFirst({
      where: desiredId
        ? { id: desiredId, companyId, status: 'active' }
        : { companyId, isDefault: true, status: 'active' },
    });
    if (!catalog && !desiredId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (!company) throw new NotFoundException('La empresa no existe');
      catalog = await this.prisma.commerceCatalog.upsert({
        where: { companyId_name: { companyId, name: 'General' } },
        update: {},
        create: { companyId, name: 'General', isDefault: true },
      });
    }
    if (!catalog) throw new BadRequestException('No existe el catálogo autorizado de la empresa');
    return catalog;
  }

  async assignProductCatalog(companyId: string, productId: string, catalogId: string) {
    const catalog = await this.resolveCatalog(companyId, catalogId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('El producto no existe');
    if (product.catalogId !== catalog.id) {
      const pending = await this.prisma.commerceReservationItem.count({
        where: { productId, reservation: { companyId, status: { in: ['hold','active','review_expired'] } } },
      });
      if (pending > 0) throw new BadRequestException('El producto tiene apartados activos; no puede cambiar de catálogo');
    }
    const category = product.categoryId
      ? await this.prisma.productCategory.findUnique({ where: { id: product.categoryId } })
      : null;
    // When switching catalogs, keep the product and stock, detach category if it belongs elsewhere.
    return this.prisma.product.update({
      where: { id: productId },
      data: { catalogId: catalog.id, categoryId: category?.catalogId === catalog.id ? undefined : null },
    });
  }

  async assignCategoryCatalog(companyId: string, categoryId: string, catalogId: string) {
    const catalog = await this.resolveCatalog(companyId, catalogId);
    const category = await this.prisma.productCategory.findFirst({ where: { id: categoryId, companyId } });
    if (!category) throw new NotFoundException('La categoría no existe');
    const conflictingProducts = await this.prisma.product.count({
      where: { categoryId, companyId, catalogId: { not: catalog.id } },
    });
    if (conflictingProducts) throw new BadRequestException('La categoría contiene productos de otro catálogo');
    return this.prisma.productCategory.update({ where: { id: categoryId }, data: { catalogId: catalog.id } });
  }

  async createCategory(dto: CreateCategoryDto) {
    const catalog = await this.resolveCatalog(dto.companyId, dto.catalogId);
    const company = await this.prisma.company.findUnique({
      where: {
        id: dto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    const existing = await this.prisma.productCategory.findFirst({
      where: {
        companyId: dto.companyId,
        catalogId: catalog.id,
        name: dto.name.trim(),
      },
    });

    if (existing) {
      throw new ConflictException('Ya existe una categoría con este nombre');
    }

    return this.prisma.productCategory.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        sortOrder: dto.sortOrder ?? 0,
        companyId: dto.companyId,
        catalogId: catalog.id,
      },
    });
  }

  async findCategoriesByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
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

  async createProduct(dto: CreateProductDto) {
    const catalog = await this.resolveCatalog(dto.companyId, dto.catalogId);
    const company = await this.prisma.company.findUnique({
      where: {
        id: dto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: {
          id: dto.categoryId,
        },
      });

      if (!category) {
        throw new NotFoundException('La categoría no existe');
      }

      if (category.catalogId !== catalog.id) {
        throw new BadRequestException('La categoría pertenece a otro catálogo');
      }

      if (category.companyId !== dto.companyId) {
        throw new BadRequestException(
          'La categoría no pertenece a esta empresa',
        );
      }
    }

    if (dto.sku?.trim()) {
      const existingSku = await this.prisma.product.findFirst({
        where: {
          companyId: dto.companyId,
          sku: dto.sku.trim(),
        },
      });

      if (existingSku) {
        throw new ConflictException('Ya existe un producto con este SKU');
      }
    }

    const variantSkus = (dto.variants ?? [])
      .map((variant) => variant.sku?.trim())
      .filter((sku): sku is string => Boolean(sku));

    if (new Set(variantSkus).size !== variantSkus.length) {
      throw new ConflictException(
        'Hay códigos repetidos entre las tallas u opciones',
      );
    }

    let seasonStartsAt: Date | undefined;

    let seasonEndsAt: Date | undefined;

    if (dto.seasonStartsAt) {
      seasonStartsAt = new Date(dto.seasonStartsAt);
    }

    if (dto.seasonEndsAt) {
      seasonEndsAt = new Date(dto.seasonEndsAt);
    }

    if (seasonStartsAt && seasonEndsAt && seasonEndsAt <= seasonStartsAt) {
      throw new BadRequestException(
        'La fecha final de temporada debe ser posterior a la fecha inicial',
      );
    }

    return this.prisma.product.create({
      data: {
        name: dto.name.trim(),

        description: dto.description?.trim(),

        type: dto.type ?? 'product',

        sku: dto.sku?.trim(),

        price: dto.price,
        unitCost: dto.unitCost,
        unitsPerPack: dto.unitsPerPack ?? 1,
        packSalePrice: dto.packSalePrice,
        webVisible: dto.webVisible ?? false,

        compareAtPrice: dto.compareAtPrice,

        trackInventory: dto.trackInventory ?? true,

        stock: dto.variants?.length ? 0 : (dto.stock ?? 0),

        lowStockAt: dto.lowStockAt ?? 5,

        featured: dto.featured ?? false,

        seasonal: dto.seasonal ?? false,

        seasonStartsAt,
        seasonEndsAt,

        companyId: dto.companyId,
        catalogId: catalog.id,

        categoryId: dto.categoryId,

        variants: dto.variants?.length
          ? {
              create: dto.variants.map((variant) => ({
                name: variant.name.trim(),
                sku: variant.sku?.trim(),
                price: variant.price,
                unitCost: variant.unitCost,
                stock: variant.stock ?? 0,
                attributes: variant.attributes,
              })),
            }
          : undefined,
      },

      include: {
        category: true,
        variants: true,
        images: true,
        barcodes: true,
      },
    });
  }

  /**
   * Alertas de inventario: agotado, poco, resagado, nuevo vs viejo y fecha límite.
   * Solo lectura; el cálculo vive en stock-alerts.ts para que el asistente lo reutilice.
   */
  async stockAlerts(companyId: string, query: Record<string, unknown> = {}) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const since90 = new Date(now.getTime() - 90 * dayMs);
    const since365 = new Date(now.getTime() - 365 * dayMs);
    const paidSale = { companyId, status: 'confirmed', paymentStatus: 'paid' };

    const [products, entries, lastSales, recentSales] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId, status: 'active', trackInventory: true },
        select: {
          id: true,
          name: true,
          sku: true,
          catalogId: true,
          trackInventory: true,
          stock: true,
          lowStockAt: true,
          createdAt: true,
          seasonal: true,
          seasonEndsAt: true,
          category: { select: { name: true } },
          variants: { where: { status: 'active' }, select: { stock: true } },
        },
      }),
      this.prisma.posStockMovement.groupBy({
        by: ['productId'],
        where: { companyId, direction: 'in' },
        _max: { createdAt: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { ...paidSale, confirmedAt: { gte: since365 } } },
        _max: { createdAt: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { ...paidSale, confirmedAt: { gte: since90 } } },
        _sum: { quantity: true },
      }),
    ]);

    const lastEntry = new Map(entries.map((row) => [row.productId, row._max.createdAt]));
    const lastSale = new Map(lastSales.map((row) => [row.productId, row._max.createdAt]));
    const sold90 = new Map(recentSales.map((row) => [row.productId, row._sum.quantity ?? 0]));

    return buildStockAlerts(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        catalogId: product.catalogId,
        categoryName: product.category?.name ?? null,
        trackInventory: product.trackInventory,
        stock:
          product.variants.length > 0
            ? product.variants.reduce((total, variant) => total + variant.stock, 0)
            : product.stock,
        lowStockAt: product.lowStockAt,
        createdAt: product.createdAt,
        deadlineAt: product.seasonal ? product.seasonEndsAt : null,
        lastEntryAt: lastEntry.get(product.id) ?? null,
        lastSaleAt: lastSale.get(product.id) ?? null,
        sold90: sold90.get(product.id) ?? 0,
      })),
      query,
      now,
      typeof query.tz === 'string' && isValidTimeZone(query.tz)
        ? query.tz
        : DEFAULT_ALERT_TIME_ZONE,
    );
  }

  async findProductsByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.product.findMany({
      where: {
        companyId,
      },

      include: {
        category: true,
        variants: true,
        images: true,
        barcodes: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Vista pública limitada: no exponer el registro completo del inventario/empresa.
  async findPublicProductsByCompany(companyId: string) {
    const site = await this.prisma.site.findFirst({
      where: { companyId, status: 'published' },
      select: { status: true },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!site) {
      throw new NotFoundException('El escaparate no está publicado');
    }
    const [products, reservations] = await Promise.all([
      this.findPublicProductRows(companyId),
      this.prisma.commerceReservation.findMany({
        where: { companyId, status: { in: [...BLOCKING_RESERVATION_STATUSES] } },
        select: { items: { select: { productId: true, variantId: true, quantity: true } } },
      }),
    ]);

    // Lo apartado ya está comprometido: la página muestra lo que de verdad se puede vender
    // (existencia − apartados activos), igual que la pantalla de Apartados.
    const reserved = new Map<string, number>();
    for (const reservation of reservations) {
      for (const item of reservation.items) {
        const key = `${item.productId}:${item.variantId ?? ''}`;
        reserved.set(key, (reserved.get(key) ?? 0) + item.quantity);
      }
    }

    return products.map((product) => ({
      ...product,
      stock: availableQuantity(product.stock, reserved.get(`${product.id}:`) ?? 0),
      variants: product.variants.map((variant) => ({
        ...variant,
        stock: availableQuantity(variant.stock, reserved.get(`${product.id}:${variant.id}`) ?? 0),
      })),
    }));
  }

  private findPublicProductRows(companyId: string) {
    return this.prisma.product.findMany({
      where: { companyId, status: 'active', webVisible: true },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        price: true,
        compareAtPrice: true,
        trackInventory: true,
        stock: true,
        status: true,
        featured: true,
        category: { select: { id: true, name: true } },
        images: {
          select: { id: true, url: true, isPrimary: true, sortOrder: true },
        },
        variants: {
          where: { status: 'active' },
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            status: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id,
      },

      include: {
        company: true,
        category: true,
        variants: true,
        images: true,
        barcodes: true,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto no existe');
    }

    return product;
  }

  async updateProduct(productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('El producto no existe');
    }

    const sku = dto.sku?.trim();

    if (sku && sku !== product.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: {
          companyId: product.companyId,
          sku,
          id: { not: productId },
        },
      });

      if (existingSku) {
        throw new ConflictException('Ya existe un producto con este SKU');
      }
    }

    // Fecha límite opcional para vender o retirar: usa los campos de temporada.
    let seasonal: boolean | undefined;
    let seasonEndsAt: Date | null | undefined;

    if (dto.seasonEndsAt !== undefined) {
      if (dto.seasonEndsAt === null) {
        seasonal = false;
        seasonEndsAt = null;
      } else {
        const deadline = new Date(dto.seasonEndsAt);

        if (Number.isNaN(deadline.getTime())) {
          throw new BadRequestException('La fecha límite no es válida');
        }

        if (product.seasonStartsAt && deadline <= product.seasonStartsAt) {
          throw new BadRequestException(
            'La fecha límite debe ser posterior al inicio de la temporada',
          );
        }

        seasonal = true;
        seasonEndsAt = deadline;
      }
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description.trim() || null,
        sku: dto.sku === undefined ? undefined : sku || null,
        price: dto.price,
        unitCost: dto.unitCost,
        unitsPerPack: dto.unitsPerPack,
        packSalePrice: dto.packSalePrice,
        webVisible: dto.webVisible,
        stock: dto.stock === undefined ? undefined : dto.stock,
        lowStockAt: dto.lowStockAt,
        seasonal,
        seasonEndsAt,
      },
      include: {
        category: true,
        variants: true,
        images: true,
        barcodes: true,
      },
    });
  }

  async addVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto no existe');
    }

    if (dto.sku?.trim()) {
      const existing = await this.prisma.productVariant.findFirst({
        where: {
          productId,
          sku: dto.sku.trim(),
        },
      });

      if (existing) {
        throw new ConflictException('Ya existe una variante con este SKU');
      }
    }

    return this.prisma.productVariant.create({
      data: {
        name: dto.name.trim(),

        sku: dto.sku?.trim(),

        price: dto.price,
        unitCost: dto.unitCost,

        stock: dto.stock ?? 0,

        attributes: dto.attributes,

        productId,
      },
    });
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException('La opción no existe');
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        price: dto.price,
        unitCost: dto.unitCost,
        stock: dto.stock,
      },
    });
  }

  async listBarcodes(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('El producto no existe');
    return this.prisma.productBarcode.findMany({
      where: { productId, active: true },
      orderBy: [{ generated: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addBarcode(
    productId: string,
    dto: CreateProductBarcodeDto,
    companyId: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, companyId: true },
    });
    if (!product || product.companyId !== companyId) {
      throw new NotFoundException('El producto no existe');
    }
    const value = dto.value.trim();
    if (!value) throw new BadRequestException('El código está vacío');
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
        select: { productId: true },
      });
      if (!variant || variant.productId !== productId) {
        throw new BadRequestException('La variante no pertenece al producto');
      }
    }
    const existing = await this.prisma.productBarcode.findFirst({
      where: { companyId, value },
    });
    if (existing) {
      throw new ConflictException('Este código ya está asignado a otro artículo');
    }
    return this.prisma.productBarcode.create({
      data: {
        value,
        format: dto.format ?? 'CODE128',
        kind: dto.kind ?? 'unit',
        unitsPerScan: dto.unitsPerScan ?? 1,
        active: dto.active ?? true,
        generated: false,
        companyId,
        productId,
        variantId: dto.variantId,
      },
    });
  }

  async generateInternalBarcode(productId: string, companyId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, companyId: true },
    });
    if (!product || product.companyId !== companyId) {
      throw new NotFoundException('El producto no existe');
    }
    const existing = await this.prisma.productBarcode.findFirst({
      where: { companyId, productId, generated: true, active: true },
    });
    if (existing) return existing;
    const base = product.id.replace(/-/g, '').slice(0, 16).toUpperCase();
    let value = `YLK-${base}`;
    const collision = await this.prisma.productBarcode.findFirst({
      where: { companyId, value },
    });
    if (collision) value = `YLK-${base}-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.productBarcode.create({
      data: {
        value,
        format: 'CODE39',
        kind: 'internal',
        unitsPerScan: 1,
        active: true,
        generated: true,
        companyId,
        productId,
      },
    });
  }

  async resolveBarcode(companyId: string, rawValue: string) {
    const value = rawValue.trim();
    const barcode = await this.prisma.productBarcode.findFirst({
      where: { companyId, value, active: true },
      include: {
        product: {
          include: { category: true, images: true, variants: true },
        },
        variant: true,
      },
    });
    if (barcode) return barcode;

    const product = await this.prisma.product.findFirst({
      where: { companyId, sku: value, status: 'active' },
      include: { category: true, images: true, variants: true },
    });
    if (product) {
      return { value, format: 'SKU', kind: 'unit', unitsPerScan: 1, product, variant: null };
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { sku: value, status: 'active', product: { companyId } },
      include: { product: { include: { category: true, images: true, variants: true } } },
    });
    if (variant) {
      return { value, format: 'SKU', kind: 'unit', unitsPerScan: 1, product: variant.product, variant };
    }
    throw new NotFoundException('Código no registrado');
  }

  async addImage(productId: string, dto: CreateImageDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto no existe');
    }

    if (dto.isPrimary) {
      return this.prisma.$transaction(async (tx) => {
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

            altText: dto.altText?.trim(),

            sortOrder: dto.sortOrder ?? 0,

            isPrimary: true,

            productId,
          },
        });
      });
    }

    return this.prisma.productImage.create({
      data: {
        url: dto.url.trim(),

        altText: dto.altText?.trim(),

        sortOrder: dto.sortOrder ?? 0,

        isPrimary: false,

        productId,
      },
    });
  }

  async makeImagePrimary(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
      },
    });

    if (!image) {
      throw new NotFoundException('La fotografía no pertenece a este producto');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });

      return tx.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      });
    });
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
      },
    });

    if (!image) {
      throw new NotFoundException('La fotografía no pertenece a este producto');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({
        where: { id: imageId },
      });

      if (image.isPrimary) {
        const replacement = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });

        if (replacement) {
          await tx.productImage.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    return {
      deleted: true,
      imageId,
    };
  }

  async updateProductStock(productId: string, dto: UpdateStockDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto no existe');
    }

    if (!product.trackInventory) {
      throw new BadRequestException('Este producto no controla inventario');
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

  async updateVariantStock(variantId: string, dto: UpdateStockDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: {
        id: variantId,
      },
    });

    if (!variant) {
      throw new NotFoundException('La variante no existe');
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
