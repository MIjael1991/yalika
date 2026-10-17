import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmReservationDepositDto } from './dto/confirm-reservation-deposit.dto';
import { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import { ExtendReservationDto } from './dto/extend-reservation.dto';
import { ReleaseReservationDto } from './dto/release-reservation.dto';
import { ReportReservationDepositDto } from './dto/report-reservation-deposit.dto';
import { UpdateReservationPolicyDto } from './dto/update-reservation-policy.dto';
import {
  BLOCKING_RESERVATION_STATUSES,
  availableQuantity,
  calculateDeposit,
} from './reservation-rules';

const DEFAULT_POLICY = {
  enabled: false,
  depositRequired: true,
  depositType: 'fixed',
  depositValue: 100,
  holdMinutes: 15,
  activeDays: 2,
} as const;

@Injectable()
export class ReservationService {
  constructor(private readonly prisma: PrismaService) {}

  private reservationInclude() {
    return {
      items: {
        orderBy: { createdAt: 'asc' as const },
      },
      events: {
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  /**
   * Los cambios de estado solo aplican si el apartado sigue como se leyó. Si otra
   * persona (o el vencimiento automático) lo cambió antes, no se pisa su trabajo.
   */
  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        throw new ConflictException(
          'El apartado cambió mientras lo atendías. Actualiza la lista e intenta de nuevo.',
        );
      }
      throw error;
    }
  }

  private nextReservationNumber() {
    const today = new Date();
    const date = [
      String(today.getFullYear()).slice(-2),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('');
    return `AP-${date}-${randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;
  }

  private async expireStaleCompany(companyId: string) {
    const now = new Date();

    const shortExpired = await this.prisma.commerceReservation.findMany({
      where: {
        companyId,
        status: 'hold',
        holdExpiresAt: { lte: now },
      },
      select: { id: true },
    });

    for (const item of shortExpired) {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.commerceReservation.findUnique({
          where: { id: item.id },
        });
        if (
          !locked ||
          locked.status !== 'hold' ||
          !locked.holdExpiresAt ||
          locked.holdExpiresAt > now
        ) {
          return;
        }

        await tx.commerceReservation.update({
          where: { id: locked.id },
          data: {
            status: 'expired',
            releasedAt: now,
          },
        });
        await tx.commerceReservationEvent.create({
          data: {
            reservationId: locked.id,
            type: 'expired',
            note: 'La reserva temporal venció y la mercancía volvió a estar disponible.',
          },
        });
      });
    }

    const reportedExpired = await this.prisma.commerceReservation.findMany({
      where: {
        companyId,
        status: 'deposit_reported',
        holdExpiresAt: { lte: now },
      },
      select: { id: true },
    });

    for (const item of reportedExpired) {
      const changed = await this.prisma.commerceReservation.updateMany({
        where: { id: item.id, status: 'deposit_reported' },
        data: { status: 'review_expired' },
      });
      if (changed.count > 0) {
        await this.prisma.commerceReservationEvent.create({
          data: {
            reservationId: item.id,
            type: 'deposit_review_timeout',
            note: 'El anticipo reportado no se verificó a tiempo. La mercancía sigue protegida y requiere revisión manual.',
          },
        });
      }
    }

    const activeExpired = await this.prisma.commerceReservation.findMany({
      where: {
        companyId,
        status: 'active',
        pickupDeadline: { lte: now },
      },
      select: { id: true },
    });

    for (const item of activeExpired) {
      const changed = await this.prisma.commerceReservation.updateMany({
        where: { id: item.id, status: 'active' },
        data: { status: 'review_expired' },
      });
      if (changed.count > 0) {
        await this.prisma.commerceReservationEvent.create({
          data: {
            reservationId: item.id,
            type: 'deadline_reached',
            note: 'La fecha de recogida venció. Requiere revisión antes de liberar.',
          },
        });
      }
    }

    return {
      expired: shortExpired.length,
      reportedReview: reportedExpired.length,
      reviewExpired: activeExpired.length,
    };
  }

  async getPolicy(companyId: string) {
    const policy = await this.prisma.commerceReservationPolicy.findUnique({
      where: { companyId },
    });

    return policy ?? { companyId, ...DEFAULT_POLICY };
  }

  async updatePolicy(companyId: string, dto: UpdateReservationPolicyDto) {
    if (dto.depositType === 'percentage' && dto.depositValue > 100) {
      throw new BadRequestException('El porcentaje de anticipo no puede superar 100');
    }

    return this.prisma.commerceReservationPolicy.upsert({
      where: { companyId },
      update: {
        enabled: dto.enabled,
        depositRequired: dto.depositRequired,
        depositType: dto.depositType,
        depositValue: dto.depositValue,
        holdMinutes: dto.holdMinutes,
        activeDays: dto.activeDays,
      },
      create: {
        companyId,
        enabled: dto.enabled,
        depositRequired: dto.depositRequired,
        depositType: dto.depositType,
        depositValue: dto.depositValue,
        holdMinutes: dto.holdMinutes,
        activeDays: dto.activeDays,
      },
    });
  }

  async publicCatalog(siteSlug: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        slug: siteSlug,
        status: 'published',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        companyId: true,
        whatsappPhone: true,
        catalogId: true,
      },
    });

    if (!site) {
      throw new NotFoundException('La tienda no está disponible');
    }

    await this.expireStaleCompany(site.companyId);

    const [policy, products, reservations] = await Promise.all([
      this.getPolicy(site.companyId),
      this.prisma.product.findMany({
        where: {
          companyId: site.companyId,
          ...(site.catalogId ? { catalogId: site.catalogId } : {}),
          status: 'active',
          webVisible: true,
        },
        include: {
          category: true,
          variants: {
            where: { status: 'active' },
            orderBy: { name: 'asc' },
          },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
          },
        },
        orderBy: [{ featured: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.commerceReservation.findMany({
        where: {
          companyId: site.companyId,
          status: { in: [...BLOCKING_RESERVATION_STATUSES] },
        },
        select: {
          items: {
            select: {
              productId: true,
              variantId: true,
              quantity: true,
            },
          },
        },
      }),
    ]);

    const reserved = new Map<string, number>();
    for (const reservation of reservations) {
      for (const item of reservation.items) {
        const key = `${item.productId}:${item.variantId ?? ''}`;
        reserved.set(key, (reserved.get(key) ?? 0) + item.quantity);
      }
    }

    return {
      site,
      policy,
      products: products.map((product) => {
        const productReserved = reserved.get(`${product.id}:`) ?? 0;
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          packSalePrice: product.packSalePrice,
          unitsPerPack: product.unitsPerPack,
          featured: product.featured,
          imageUrl: product.images[0]?.url ?? null,
          category: product.category
            ? { id: product.category.id, name: product.category.name }
            : null,
          available: product.variants.length
            ? null
            : availableQuantity(product.stock, productReserved),
          variants: product.variants.map((variant) => {
            const key = `${product.id}:${variant.id}`;
            return {
              id: variant.id,
              name: variant.name,
              price: variant.price ?? product.price,
              available: availableQuantity(
                variant.stock,
                reserved.get(key) ?? 0,
              ),
              attributes: variant.attributes,
            };
          }),
        };
      }),
    };
  }

  async createPublicHold(dto: CreateReservationHoldDto) {
    const site = await this.prisma.site.findFirst({
      where: {
        slug: dto.siteSlug,
        status: 'published',
      },
      select: {
        id: true,
        companyId: true,
        slug: true,
        catalogId: true,
      },
    });

    if (!site) {
      throw new NotFoundException('La tienda no está disponible');
    }

    const policy = await this.getPolicy(site.companyId);
    if (!policy.enabled) {
      throw new BadRequestException('Esta tienda no tiene apartados activados');
    }

    await this.expireStaleCompany(site.companyId);

    const duplicate = await this.prisma.commerceReservation.findFirst({
      where: {
        companyId: site.companyId,
        operationId: dto.operationId,
      },
      include: this.reservationInclude(),
    });
    if (duplicate) return duplicate;

    const normalizedPhone = dto.contactPhone.replace(/\D/g, '');
    if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      throw new BadRequestException('Escribe un teléfono válido');
    }

    const uniqueKeys = new Set<string>();
    for (const item of dto.items) {
      const key = `${item.productId}:${item.variantId ?? ''}`;
      if (uniqueKeys.has(key)) {
        throw new BadRequestException('No repitas el mismo producto o variante');
      }
      uniqueKeys.add(key);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const prepared: Array<{
          productId: string;
          variantId?: string;
          quantity: number;
          unitPriceSnapshot: number;
          productNameSnapshot: string;
          variantSnapshot?: string;
        }> = [];

        let total = 0;
        let preparedCatalogId: string | undefined;

        for (const requested of [...dto.items].sort((a, b) =>
          `${a.productId}:${a.variantId ?? ''}`.localeCompare(
            `${b.productId}:${b.variantId ?? ''}`,
          ),
        )) {
          const product = await tx.product.findFirst({
            where: {
              id: requested.productId,
              companyId: site.companyId,
              ...(site.catalogId ? { catalogId: site.catalogId } : {}),
              status: 'active',
              webVisible: true,
            },
            include: {
              variants: {
                where: { status: 'active' },
              },
            },
          });

          if (!product) {
            throw new NotFoundException('Uno de los productos ya no está disponible');
          }
          if (!product.catalogId || (prepared.length && preparedCatalogId !== product.catalogId)) {
            throw new BadRequestException('No se pueden apartar productos de distintos catálogos');
          }
          preparedCatalogId = product.catalogId;
          if (!product.trackInventory) {
            throw new BadRequestException(
              `${product.name} no utiliza inventario y no puede apartarse`,
            );
          }

          let unitPrice = product.price;
          let stock = product.stock;
          let variantSnapshot: string | undefined;

          if (requested.variantId) {
            await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "product_variants"
              WHERE "id" = ${requested.variantId}
              FOR UPDATE
            `;
            const variant = await tx.productVariant.findFirst({
              where: {
                id: requested.variantId,
                productId: product.id,
                status: 'active',
              },
            });
            if (!variant) {
              throw new BadRequestException('La variante ya no está disponible');
            }
            unitPrice = variant.price ?? product.price;
            stock = variant.stock;
            variantSnapshot = variant.name;
          } else {
            if (product.variants.length > 0) {
              throw new BadRequestException(
                `Selecciona una variante de ${product.name}`,
              );
            }
            await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "products"
              WHERE "id" = ${product.id}
              FOR UPDATE
            `;

            // Releer después del FOR UPDATE: una venta concurrente pudo
            // cambiar la existencia entre la primera lectura y el bloqueo.
            const lockedProduct = await tx.product.findFirst({
              where: {
                id: product.id,
                companyId: site.companyId,
                status: 'active',
                webVisible: true,
              },
            });
            if (!lockedProduct) {
              throw new NotFoundException(
                'Uno de los productos ya no está disponible',
              );
            }
            stock = lockedProduct.stock;
            unitPrice = lockedProduct.price;
          }

          const reserved = await tx.commerceReservationItem.aggregate({
            where: {
              productId: product.id,
              variantId: requested.variantId ?? null,
              reservation: {
                status: { in: [...BLOCKING_RESERVATION_STATUSES] },
              },
            },
            _sum: { quantity: true },
          });

          const available = availableQuantity(
            stock,
            reserved._sum.quantity ?? 0,
          );

          if (available < requested.quantity) {
            throw new ConflictException(
              available <= 0
                ? `${product.name} está apartado por el momento`
                : `Sólo quedan ${available} disponibles de ${product.name}`,
            );
          }

          total =
            Math.round(
              (total + unitPrice * requested.quantity) * 100,
            ) / 100;

          prepared.push({
            productId: product.id,
            variantId: requested.variantId,
            quantity: requested.quantity,
            unitPriceSnapshot: unitPrice,
            productNameSnapshot: product.name,
            variantSnapshot,
          });
        }

        const now = new Date();
        const holdExpiresAt = new Date(
          now.getTime() + policy.holdMinutes * 60 * 1000,
        );
        const depositRequiredAmount = calculateDeposit(
          total,
          policy.depositRequired,
          policy.depositType,
          policy.depositValue,
        );

        const reservation = await tx.commerceReservation.create({
          data: {
            reservationNumber: this.nextReservationNumber(),
            operationId: dto.operationId,
            status:
              policy.depositRequired && depositRequiredAmount > 0
                ? 'hold'
                : 'active',
            source: 'web',
            holdExpiresAt:
              policy.depositRequired && depositRequiredAmount > 0
                ? holdExpiresAt
                : null,
            pickupDeadline:
              !policy.depositRequired || depositRequiredAmount <= 0
                ? new Date(now.getTime() + policy.activeDays * 86400000)
                : null,
            depositRequiredAmount,
            depositAmount: 0,
            depositStatus:
              policy.depositRequired && depositRequiredAmount > 0
                ? 'pending'
                : 'none',
            contactName: dto.contactName.trim(),
            contactPhone: normalizedPhone,
            deliveryMode: dto.deliveryMode ?? 'arrange',
            notes: dto.notes?.trim(),
            companyId: site.companyId,
            siteId: site.id,
            catalogId: preparedCatalogId,
            items: {
              create: prepared,
            },
            events: {
              create: {
                type: 'hold_started',
                note:
                  policy.depositRequired && depositRequiredAmount > 0
                    ? `Reserva temporal por ${policy.holdMinutes} minutos`
                    : `Apartado activo por ${policy.activeDays} días sin anticipo`,
              },
            },
          },
          include: this.reservationInclude(),
        });

        return reservation;
      });
    } catch (error: unknown) {
      const maybe = error as { code?: string };
      if (maybe?.code === 'P2002') {
        const existing = await this.prisma.commerceReservation.findFirst({
          where: {
            companyId: site.companyId,
            operationId: dto.operationId,
          },
          include: this.reservationInclude(),
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async publicByToken(token: string) {
    const reservation = await this.prisma.commerceReservation.findUnique({
      where: { publicToken: token },
      include: this.reservationInclude(),
    });
    if (!reservation) {
      throw new NotFoundException('El apartado no existe');
    }

    await this.expireStaleCompany(reservation.companyId);

    const current = await this.prisma.commerceReservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: this.reservationInclude(),
    });

    const site = current.siteId
      ? await this.prisma.site.findUnique({
          where: { id: current.siteId },
          select: {
            name: true,
            slug: true,
            whatsappPhone: true,
          },
        })
      : null;

    return {
      reservationNumber: current.reservationNumber,
      publicToken: current.publicToken,
      status: current.status,
      holdExpiresAt: current.holdExpiresAt,
      pickupDeadline: current.pickupDeadline,
      depositRequiredAmount: current.depositRequiredAmount,
      depositAmount: current.depositAmount,
      depositStatus: current.depositStatus,
      deliveryMode: current.deliveryMode,
      items: current.items.map((item) => ({
        productName: item.productNameSnapshot,
        variant: item.variantSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPriceSnapshot,
      })),
      site,
    };
  }

  async reportDeposit(token: string, dto: ReportReservationDepositDto) {
    const reservation = await this.prisma.commerceReservation.findUnique({
      where: { publicToken: token },
    });
    if (!reservation) {
      throw new NotFoundException('El apartado no existe');
    }

    await this.expireStaleCompany(reservation.companyId);
    const current = await this.prisma.commerceReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });

    if (!['hold', 'deposit_reported'].includes(current.status)) {
      throw new BadRequestException(
        'Este apartado ya no puede reportar un anticipo',
      );
    }

    // El plazo de revisión se fija solo con el primer reporte: volver a reportar
    // no puede extenderlo, o el cliente mantendría la mercancía bloqueada.
    const reviewUntil =
      current.status === 'deposit_reported' && current.holdExpiresAt
        ? current.holdExpiresAt
        : new Date(Date.now() + 60 * 60 * 1000);
    const updated = await this.guarded(() =>
      this.prisma.commerceReservation.update({
        where: { id: current.id, status: current.status },
        data: {
          status: 'deposit_reported',
          depositAmount: dto.amount,
          depositStatus: 'reported',
          depositMethod: dto.method,
          depositReference: dto.reference?.trim(),
          holdExpiresAt: reviewUntil,
        },
        include: this.reservationInclude(),
      }),
    );

    await this.prisma.commerceReservationEvent.create({
      data: {
        reservationId: current.id,
        type: 'deposit_reported',
        note: `El cliente reportó un anticipo de $${dto.amount.toFixed(2)}. Pendiente de verificación.`,
      },
    });

    return updated;
  }

  async cancelPublic(token: string) {
    const reservation = await this.prisma.commerceReservation.findUnique({
      where: { publicToken: token },
    });
    if (!reservation) {
      throw new NotFoundException('El apartado no existe');
    }
    if (reservation.status !== 'hold') {
      throw new BadRequestException(
        reservation.status === 'deposit_reported'
          ? 'Ya reportaste un anticipo. Contacta a la tienda antes de liberar la mercancía.'
          : 'Este apartado requiere atención de la tienda para cancelarse',
      );
    }

    const updated = await this.guarded(() =>
      this.prisma.commerceReservation.update({
        where: { id: reservation.id, status: reservation.status },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          releasedAt: new Date(),
        },
      }),
    );
    await this.prisma.commerceReservationEvent.create({
      data: {
        reservationId: reservation.id,
        type: 'cancelled_by_customer',
      },
    });
    return updated;
  }

  async listCompany(companyId: string) {
    await this.expireStaleCompany(companyId);
    return this.prisma.commerceReservation.findMany({
      where: { companyId },
      include: this.reservationInclude(),
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  private async owned(companyId: string, id: string) {
    const reservation = await this.prisma.commerceReservation.findFirst({
      where: { id, companyId },
      include: this.reservationInclude(),
    });
    if (!reservation) {
      throw new NotFoundException('El apartado no existe');
    }
    return reservation;
  }

  async confirmDeposit(
    companyId: string,
    id: string,
    dto: ConfirmReservationDepositDto,
    actorId: string,
  ) {
    const reservation = await this.owned(companyId, id);
    const canConfirmReportedReview =
      reservation.status === 'review_expired' &&
      reservation.depositStatus === 'reported';

    if (
      !['hold', 'deposit_reported'].includes(reservation.status) &&
      !canConfirmReportedReview
    ) {
      throw new BadRequestException('Este apartado ya no espera anticipo');
    }
    if (
      reservation.depositRequiredAmount > 0 &&
      dto.amount + 0.001 < reservation.depositRequiredAmount
    ) {
      throw new BadRequestException(
        `El anticipo confirmado debe ser al menos $${reservation.depositRequiredAmount.toFixed(2)}`,
      );
    }

    const policy = await this.getPolicy(companyId);
    const now = new Date();
    const pickupDeadline = new Date(
      now.getTime() + policy.activeDays * 86400000,
    );

    const updated = await this.guarded(() =>
      this.prisma.commerceReservation.update({
        where: { id, status: reservation.status },
        data: {
          status: 'active',
          depositAmount: dto.amount,
          depositStatus: 'confirmed',
          depositMethod: dto.method,
          depositReference: dto.reference?.trim(),
          confirmedAt: now,
          pickupDeadline,
          holdExpiresAt: null,
        },
        include: this.reservationInclude(),
      }),
    );

    await this.prisma.commerceReservationEvent.create({
      data: {
        reservationId: id,
        type: 'deposit_confirmed',
        actorId,
        note: `Anticipo confirmado: $${dto.amount.toFixed(2)}.`,
      },
    });

    return updated;
  }

  async extend(
    companyId: string,
    id: string,
    dto: ExtendReservationDto,
    actorId: string,
  ) {
    const reservation = await this.owned(companyId, id);
    if (!['active', 'review_expired'].includes(reservation.status)) {
      throw new BadRequestException('Sólo un apartado activo puede extenderse');
    }

    const base =
      reservation.pickupDeadline &&
      reservation.pickupDeadline.getTime() > Date.now()
        ? reservation.pickupDeadline
        : new Date();
    const pickupDeadline = new Date(
      base.getTime() + dto.days * 86400000,
    );

    const updated = await this.guarded(() =>
      this.prisma.commerceReservation.update({
        where: { id, status: reservation.status },
        data: {
          status: 'active',
          pickupDeadline,
        },
        include: this.reservationInclude(),
      }),
    );

    await this.prisma.commerceReservationEvent.create({
      data: {
        reservationId: id,
        type: 'deadline_extended',
        actorId,
        note: `Apartado extendido ${dto.days} día(s).`,
      },
    });

    return updated;
  }

  async release(
    companyId: string,
    id: string,
    dto: ReleaseReservationDto,
    actorId: string,
  ) {
    const reservation = await this.owned(companyId, id);
    if (!BLOCKING_RESERVATION_STATUSES.includes(
      reservation.status as (typeof BLOCKING_RESERVATION_STATUSES)[number],
    )) {
      throw new BadRequestException('Este apartado ya no bloquea mercancía');
    }

    const updated = await this.guarded(() =>
      this.prisma.commerceReservation.update({
        where: { id, status: reservation.status },
        data: {
          status: 'released',
          releasedAt: new Date(),
          notes: dto.reason?.trim()
            ? [reservation.notes, `Liberación: ${dto.reason.trim()}`]
                .filter(Boolean)
                .join('\n')
            : reservation.notes,
        },
        include: this.reservationInclude(),
      }),
    );

    await this.prisma.commerceReservationEvent.create({
      data: {
        reservationId: id,
        type: 'released',
        actorId,
        note: dto.reason?.trim() || 'Liberado manualmente',
      },
    });

    return updated;
  }

  async expire(companyId: string) {
    return this.expireStaleCompany(companyId);
  }

  async complete(
    companyId: string,
    id: string,
    actorId: string,
  ) {
    const reservation = await this.owned(companyId, id);
    if (!reservation.orderId) {
      throw new BadRequestException('El apartado todavía no tiene una venta vinculada');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: reservation.orderId,
        companyId,
        paymentStatus: 'paid',
      },
    });
    if (!order) {
      throw new BadRequestException('La venta vinculada todavía tiene saldo pendiente');
    }

    const updated = await this.guarded(() =>
      this.prisma.commerceReservation.update({
        where: { id, status: reservation.status },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
        include: this.reservationInclude(),
      }),
    );

    await this.prisma.commerceReservationEvent.create({
      data: {
        reservationId: id,
        type: 'completed',
        actorId,
        note: `Venta ${order.orderNumber} pagada y apartado completado.`,
      },
    });

    return updated;
  }
}
