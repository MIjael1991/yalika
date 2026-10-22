import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  allocateCents,
  calculateBuyXGetYDiscountCents,
  calculateDiscountCents,
  DiscountType,
  fromCents,
  toCents,
} from './discount-calculator';
import { ApplyOrderDiscountDto } from './dto/apply-order-discount.dto';
import { VoidOrderDiscountDto } from './dto/void-order-discount.dto';

type DiscountOrder = {
  id: string;
  companyId: string;
  status: string;
  paymentStatus: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

type ResolvedTerms = {
  type: DiscountType;
  value: number;
  orderItemId?: string;
  promotionId?: string;
};

@Injectable()
export class OrderDiscountService {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: { select: { id: true, name: true } },
            voidedBy: { select: { id: true, name: true } },
          },
          orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!order) {
      throw new NotFoundException('El pedido no existe');
    }

    return order;
  }

  async apply(orderId: string, dto: ApplyOrderDiscountDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "orders"
        WHERE "id" = ${orderId}
        FOR UPDATE
      `;

      if (dto.operationId) {
        const existing = await tx.orderDiscount.findFirst({
          where: {
            companyId: dto.companyId,
            operationId: dto.operationId,
          },
        });

        if (existing) {
          if (existing.orderId !== orderId) {
            throw new BadRequestException(
              'El operationId ya fue utilizado en otro pedido',
            );
          }
          return this.getOrderResult(tx, orderId, existing.id);
        }
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          splits: { select: { id: true } },
          payments: { where: { status: 'completed' }, select: { id: true } },
          discounts: { where: { status: 'applied' } },
        },
      });

      if (!order) {
        throw new NotFoundException('El pedido no existe');
      }
      if (order.companyId !== dto.companyId) {
        throw new BadRequestException('El pedido no pertenece a esta empresa');
      }
      if (order.status !== 'draft') {
        throw new BadRequestException(
          'Los descuentos solo pueden modificarse mientras el pedido está en borrador',
        );
      }
      if (order.paymentStatus !== 'pending' || order.payments.length > 0) {
        throw new BadRequestException(
          'No se pueden modificar descuentos después de registrar pagos',
        );
      }
      if (order.splits.length > 0) {
        throw new BadRequestException(
          'El descuento debe aplicarse antes de dividir la cuenta',
        );
      }

      await this.validateActiveUser(tx, dto.authorizedById, dto.companyId);

      const activeOrderDiscount = order.discounts.find(
        (discount) => discount.scope === 'order',
      );
      const terms = await this.resolveTerms(tx, order, dto);

      if (dto.scope === 'order' && activeOrderDiscount) {
        throw new ConflictException('El pedido ya tiene un descuento general');
      }

      if (dto.scope === 'item') {
        if (activeOrderDiscount) {
          throw new BadRequestException(
            'Anula primero el descuento general para modificar descuentos de productos',
          );
        }

        const existingItemDiscount = order.discounts.find(
          (discount) => discount.orderItemId === terms.orderItemId,
        );
        if (existingItemDiscount) {
          throw new ConflictException(
            'Este producto ya tiene un descuento aplicado',
          );
        }
      }

      const created = await tx.orderDiscount.create({
        data: {
          scope: dto.scope,
          source: dto.source,
          type: terms.type,
          value: terms.value,
          amount: 0,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim(),
          status: 'applied',
          operationId: dto.operationId,
          companyId: dto.companyId,
          orderId,
          orderItemId: terms.orderItemId,
          promotionId: terms.promotionId,
          authorizedById: dto.authorizedById,
        },
      });

      await this.recalculateOrder(tx, orderId);
      return this.getOrderResult(tx, orderId, created.id);
    });
  }

  async voidDiscount(id: string, dto: VoidOrderDiscountDto) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.orderDiscount.findUnique({ where: { id } });
      if (!initial) {
        throw new NotFoundException('El descuento no existe');
      }

      await tx.$queryRaw`
        SELECT "id"
        FROM "orders"
        WHERE "id" = ${initial.orderId}
        FOR UPDATE
      `;

      const discount = await tx.orderDiscount.findUniqueOrThrow({
        where: { id },
        include: { order: true },
      });

      if (discount.companyId !== dto.companyId) {
        throw new BadRequestException(
          'El descuento no pertenece a esta empresa',
        );
      }
      if (discount.order.status !== 'draft') {
        throw new BadRequestException(
          'Los descuentos de una venta confirmada conservan su historial y ya no pueden anularse',
        );
      }

      await this.validateActiveUser(tx, dto.voidedById, dto.companyId);

      if (discount.status === 'voided') {
        return this.getOrderResult(tx, discount.orderId, discount.id);
      }

      if (discount.scope === 'item') {
        const activeOrderDiscount = await tx.orderDiscount.findFirst({
          where: {
            orderId: discount.orderId,
            scope: 'order',
            status: 'applied',
          },
        });

        if (activeOrderDiscount) {
          throw new BadRequestException(
            'Anula primero el descuento general del pedido',
          );
        }
      }

      await tx.orderDiscount.update({
        where: { id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidReason: dto.reason.trim(),
          voidedById: dto.voidedById,
        },
      });

      await this.recalculateOrder(tx, discount.orderId);
      return this.getOrderResult(tx, discount.orderId, discount.id);
    });
  }

  private async resolveTerms(
    tx: Prisma.TransactionClient,
    order: DiscountOrder,
    dto: ApplyOrderDiscountDto,
  ): Promise<ResolvedTerms> {
    const orderItem = dto.orderItemId
      ? order.items.find((item) => item.id === dto.orderItemId)
      : undefined;

    if (dto.scope === 'item' && !orderItem) {
      throw new BadRequestException(
        'Un descuento de producto necesita un orderItemId válido',
      );
    }
    if (dto.scope === 'order' && dto.orderItemId) {
      throw new BadRequestException(
        'Un descuento general no debe incluir orderItemId',
      );
    }

    if (dto.promotionId) {
      if (dto.source !== 'promotion') {
        throw new BadRequestException(
          'Un descuento ligado a promoción debe utilizar source promotion',
        );
      }

      const promotion = await tx.promotion.findUnique({
        where: { id: dto.promotionId },
        include: { products: true },
      });
      const now = new Date();

      if (!promotion) {
        throw new NotFoundException('La promoción no existe');
      }
      if (promotion.companyId !== order.companyId) {
        throw new BadRequestException(
          'La promoción no pertenece a esta empresa',
        );
      }
      if (
        promotion.status !== 'active' ||
        now < promotion.startsAt ||
        now > promotion.endsAt
      ) {
        throw new BadRequestException('La promoción no está vigente');
      }
      if (
        !['percentage', 'fixed', 'special_price', 'buy_x_get_y'].includes(
          promotion.type,
        )
      ) {
        throw new BadRequestException(
          'Esta promoción requiere el motor automático de Checkout',
        );
      }

      const subtotal = order.items.reduce(
        (total, item) => total + item.lineTotal,
        0,
      );

      if (
        promotion.minimumPurchase !== null &&
        promotion.minimumPurchase > 0 &&
        subtotal < promotion.minimumPurchase
      ) {
        throw new BadRequestException(
          `Esta promoción requiere una compra mínima de ${promotion.minimumPurchase.toFixed(2)}`,
        );
      }
      if (promotion.scope === 'selected_products') {
        if (!orderItem) {
          throw new BadRequestException(
            'Esta promoción debe aplicarse a uno de sus productos',
          );
        }
        if (
          !promotion.products.some(
            (item) => item.productId === orderItem.productId,
          )
        ) {
          throw new BadRequestException(
            'El producto no pertenece a esta promoción',
          );
        }
      }

      if (promotion.type === 'buy_x_get_y') {
        if (
          dto.scope !== 'item' ||
          !orderItem ||
          !promotion.buyQuantity ||
          !promotion.getQuantity
        ) {
          throw new BadRequestException(
            'Compra X y recibe Y debe aplicarse a un producto válido',
          );
        }

        const discountCents = calculateBuyXGetYDiscountCents(
          orderItem.unitPrice,
          orderItem.quantity,
          promotion.buyQuantity,
          promotion.getQuantity,
        );

        if (discountCents <= 0) {
          throw new BadRequestException(
            `Agrega ${promotion.buyQuantity + promotion.getQuantity} unidades para usar esta promoción`,
          );
        }

        return {
          type: 'fixed',
          value: fromCents(discountCents),
          orderItemId: orderItem.id,
          promotionId: promotion.id,
        };
      }

      const type = this.asDiscountType(promotion.type);
      if (type === 'special_price' && dto.scope !== 'item') {
        throw new BadRequestException(
          'El precio especial solo puede aplicarse a un producto',
        );
      }

      const value =
        type === 'special_price'
          ? promotion.specialPrice
          : promotion.discountValue;
      if (value === null || value === undefined) {
        throw new BadRequestException(
          'La promoción no tiene configurado el valor requerido',
        );
      }

      return {
        type,
        value,
        orderItemId: orderItem?.id,
        promotionId: promotion.id,
      };
    }

    if (dto.source === 'promotion') {
      throw new BadRequestException('source promotion necesita promotionId');
    }
    if (!dto.type || dto.value === undefined) {
      throw new BadRequestException(
        'Un descuento sin promoción necesita type y value',
      );
    }

    const type = this.asDiscountType(dto.type);
    if (type === 'special_price' && dto.scope !== 'item') {
      throw new BadRequestException(
        'El precio especial solo puede aplicarse a un producto',
      );
    }

    return {
      type,
      value: dto.value,
      orderItemId: orderItem?.id,
    };
  }

  private async recalculateOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        discounts: {
          where: { status: 'applied' },
          orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const orderDiscounts = order.discounts.filter(
      (discount) => discount.scope === 'order',
    );
    if (orderDiscounts.length > 1) {
      throw new ConflictException(
        'El pedido tiene más de un descuento general',
      );
    }

    const itemDiscountByItem = new Map(
      order.discounts
        .filter((discount) => discount.scope === 'item')
        .map((discount) => [discount.orderItemId, discount]),
    );
    if (
      itemDiscountByItem.size !==
      order.discounts.length - orderDiscounts.length
    ) {
      throw new ConflictException(
        'Un producto tiene más de un descuento activo',
      );
    }

    const baseCents = order.items.map((item) => toCents(item.lineTotal));
    const itemDiscountCents: number[] = [];
    const afterItemDiscountCents: number[] = [];

    for (let index = 0; index < order.items.length; index++) {
      const item = order.items[index];
      const discount = itemDiscountByItem.get(item.id);
      const amountCents = discount
        ? calculateDiscountCents(
            this.asDiscountType(discount.type),
            discount.value,
            baseCents[index],
            item.quantity,
          )
        : 0;

      itemDiscountCents.push(amountCents);
      afterItemDiscountCents.push(baseCents[index] - amountCents);

      if (discount) {
        await tx.orderDiscount.update({
          where: { id: discount.id },
          data: { amount: fromCents(amountCents) },
        });
      }
    }

    let orderDiscountCents = 0;
    let orderAllocations = order.items.map(() => 0);
    const orderDiscount = orderDiscounts[0];

    if (orderDiscount) {
      if (orderDiscount.type === 'special_price') {
        throw new BadRequestException(
          'Un precio especial no puede ser descuento general',
        );
      }

      const eligibleCents = afterItemDiscountCents.reduce(
        (sum, value) => sum + value,
        0,
      );
      if (eligibleCents <= 0) {
        throw new BadRequestException(
          'El pedido ya no tiene saldo disponible para otro descuento',
        );
      }

      orderDiscountCents = calculateDiscountCents(
        this.asDiscountType(orderDiscount.type),
        orderDiscount.value,
        eligibleCents,
      );
      orderAllocations = allocateCents(
        orderDiscountCents,
        afterItemDiscountCents,
      );

      await tx.orderDiscount.update({
        where: { id: orderDiscount.id },
        data: { amount: fromCents(orderDiscountCents) },
      });
    }

    let subtotalCents = 0;
    let totalCents = 0;

    for (let index = 0; index < order.items.length; index++) {
      const discountCents = itemDiscountCents[index] + orderAllocations[index];
      const itemTotalCents = baseCents[index] - discountCents;

      subtotalCents += baseCents[index];
      totalCents += itemTotalCents;

      await tx.orderItem.update({
        where: { id: order.items[index].id },
        data: {
          discount: fromCents(discountCents),
          total: fromCents(itemTotalCents),
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        subtotal: fromCents(subtotalCents),
        discount: fromCents(subtotalCents - totalCents),
        total: fromCents(totalCents),
      },
    });
  }

  private async validateActiveUser(
    tx: Prisma.TransactionClient,
    userId: string,
    companyId: string,
  ) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('El usuario autorizador no existe');
    }
    if (user.companyId !== companyId || user.status !== 'active') {
      throw new BadRequestException(
        'El usuario autorizador no está activo en esta empresa',
      );
    }
  }

  private async getOrderResult(
    tx: Prisma.TransactionClient,
    orderId: string,
    discountId: string,
  ) {
    const discount = await tx.orderDiscount.findUniqueOrThrow({
      where: { id: discountId },
      include: {
        orderItem: true,
        promotion: true,
        authorizedBy: { select: { id: true, name: true } },
        voidedBy: { select: { id: true, name: true } },
      },
    });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: true,
        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: { select: { id: true, name: true } },
            voidedBy: { select: { id: true, name: true } },
          },
          orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return { discount, order };
  }

  private asDiscountType(type: string): DiscountType {
    if (type === 'percentage' || type === 'fixed' || type === 'special_price') {
      return type;
    }
    throw new BadRequestException('El tipo de descuento no es compatible');
  }
}
