import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type LoyaltyResult = {
  confirmedVisits: number;
  requiredVisits: number;
  remainingVisits: number;
  rewardCreated: boolean;
  reward: unknown;
} | null;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =====================================================
   * LISTAR PEDIDOS DE UNA EMPRESA
   * =====================================================
   */
  async findByCompany(
    companyId: string,
  ) {
    return this.prisma.order.findMany({
      where: {
        companyId,
      },

      include: {
        customer: true,

        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: true,
            voidedBy: true,
          },

          orderBy: {
            appliedAt: 'asc',
          },
        },

        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /*
   * =====================================================
   * CONSULTAR UN PEDIDO
   * =====================================================
   */
  async findOne(
    id: string,
  ) {
    const order =
      await this.prisma.order.findUnique({
        where: {
          id,
        },

        include: {
          company: true,
          customer: true,
          loyaltyProgram: true,

          discounts: {
            include: {
              orderItem: true,
              promotion: true,
              authorizedBy: true,
              voidedBy: true,
            },

            orderBy: {
              appliedAt: 'asc',
            },
          },

          items: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      });

    if (!order) {
      throw new NotFoundException(
        'El pedido no existe',
      );
    }

    return order;
  }

  /*
   * =====================================================
   * CREAR PEDIDO
   * =====================================================
   *
   * Aquí todavía NO descontamos inventario.
   *
   * El pedido nace como:
   *
   * status = draft
   *
   * El inventario se descuenta hasta confirmar.
   * =====================================================
   */
  async create(
    dto: CreateOrderDto,
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

    /*
     * CLIENTE OPCIONAL
     */
    if (dto.customerId) {
      const customer =
        await this.prisma.customer.findUnique({
          where: {
            id: dto.customerId,
          },
        });

      if (!customer) {
        throw new NotFoundException(
          'El cliente no existe',
        );
      }

      if (
        customer.companyId !==
        dto.companyId
      ) {
        throw new BadRequestException(
          'El cliente no pertenece a esta empresa',
        );
      }
    }

    /*
     * FIDELIZACIÓN OPCIONAL
     */
    if (dto.loyaltyProgramId) {
      const program =
        await this.prisma.loyaltyProgram.findUnique({
          where: {
            id:
              dto.loyaltyProgramId,
          },
        });

      if (!program) {
        throw new NotFoundException(
          'La campaña de fidelización no existe',
        );
      }

      if (
        program.companyId !==
        dto.companyId
      ) {
        throw new BadRequestException(
          'La campaña no pertenece a esta empresa',
        );
      }

      if (!dto.customerId) {
        throw new BadRequestException(
          'Para acumular fidelización se necesita un cliente',
        );
      }
    }

    /*
     * PREPARAMOS LOS PRODUCTOS.
     *
     * Guardamos nombre, SKU y precio dentro
     * del pedido para conservar el historial.
     */
    const preparedItems: Array<{
      productId: string;
      variantId?: string;
      productName: string;
      sku?: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      discount: number;
      total: number;
    }> = [];

    let subtotal = 0;

    for (const requestedItem of dto.items) {
      const product =
        await this.prisma.product.findUnique({
          where: {
            id:
              requestedItem.productId,
          },
        });

      if (!product) {
        throw new NotFoundException(
          'Uno de los productos no existe',
        );
      }

      if (
        product.companyId !==
        dto.companyId
      ) {
        throw new BadRequestException(
          `${product.name} no pertenece a esta empresa`,
        );
      }

      if (
        product.status !== 'active'
      ) {
        throw new BadRequestException(
          `${product.name} no está disponible`,
        );
      }

      let unitPrice =
        product.price;

      let sku =
        product.sku ??
        undefined;

      /*
       * VARIANTE OPCIONAL.
       *
       * Ejemplo:
       *
       * Vestido
       *   └── Negro / M
       */
      if (requestedItem.variantId) {
        const variant =
          await this.prisma.productVariant.findUnique({
            where: {
              id:
                requestedItem.variantId,
            },
          });

        if (!variant) {
          throw new NotFoundException(
            'La variante no existe',
          );
        }

        if (
          variant.productId !==
          product.id
        ) {
          throw new BadRequestException(
            'La variante no pertenece al producto',
          );
        }

        if (
          variant.status !==
          'active'
        ) {
          throw new BadRequestException(
            'La variante no está disponible',
          );
        }

        if (
          variant.price !== null
        ) {
          unitPrice =
            variant.price;
        }

        sku =
          variant.sku ??
          product.sku ??
          undefined;
      }

      const lineTotal =
        Math.round(
          unitPrice *
            requestedItem.quantity *
            100,
        ) / 100;

      subtotal =
        Math.round(
          (
            subtotal +
            lineTotal
          ) * 100,
        ) / 100;

      preparedItems.push({
        productId:
          product.id,

        variantId:
          requestedItem.variantId,

        productName:
          product.name,

        sku,

        quantity:
          requestedItem.quantity,

        unitPrice,

        lineTotal,

        discount: 0,

        total: lineTotal,
      });
    }

    /*
     * NÚMERO DEL PEDIDO
     */
    const now =
      new Date();

    const randomPart =
      Math.floor(
        Math.random() * 10000,
      )
        .toString()
        .padStart(4, '0');

    const orderNumber =
      `ORD-${now.getFullYear()}${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}${String(
        now.getDate(),
      ).padStart(2, '0')}-${Date.now()}-${randomPart}`;

    /*
     * GUARDAMOS PEDIDO + PRODUCTOS
     */
    return this.prisma.order.create({
      data: {
        orderNumber,

        source:
          dto.source ??
          'manual',

        orderType:
          dto.orderType ??
          'counter',

        status:
          'draft',

        paymentStatus:
          'pending',

        subtotal,

        discount:
          0,

        total:
          subtotal,

        notes:
          dto.notes?.trim(),

        companyId:
          dto.companyId,

        customerId:
          dto.customerId,

        loyaltyProgramId:
          dto.loyaltyProgramId,

        items: {
          create:
            preparedItems.map(
              (item) => ({
                productId:
                  item.productId,

                variantId:
                  item.variantId,

                productName:
                  item.productName,

                sku:
                  item.sku,

                quantity:
                  item.quantity,

                unitPrice:
                  item.unitPrice,

                lineTotal:
                  item.lineTotal,

                discount:
                  item.discount,

                total:
                  item.total,
              }),
            ),
        },
      },

      include: {
        customer: true,
        items: true,
      },
    });
  }

  /*
   * =====================================================
   * CONFIRMAR PEDIDO
   * =====================================================
   *
   * Aquí sí hacemos:
   *
   * 1. proteger contra doble confirmación
   * 2. descontar receta si existe
   * 3. si no hay receta, descontar stock directo
   * 4. registrar movimientos
   * 5. registrar fidelización
   * 6. confirmar pedido
   *
   * Todo dentro de una transacción.
   * =====================================================
   */
  async confirm(
    id: string,
  ) {
    const order =
      await this.prisma.order.findUnique({
        where: {
          id,
        },

        include: {
          items: true,
        },
      });

    if (!order) {
      throw new NotFoundException(
        'El pedido no existe',
      );
    }

    if (
      order.status !== 'draft'
    ) {
      throw new BadRequestException(
        'Solo un pedido en borrador puede confirmarse',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * -------------------------------------------------
         * BLOQUEAMOS DOBLE CONFIRMACIÓN
         * -------------------------------------------------
         *
         * Si dos peticiones intentan confirmar
         * la misma venta, solo una podrá cambiar:
         *
         * draft -> processing
         */
        const lockResult =
          await tx.order.updateMany({
            where: {
              id:
                order.id,

              status:
                'draft',
            },

            data: {
              status:
                'processing',
            },
          });

        if (
          lockResult.count === 0
        ) {
          throw new BadRequestException(
            'Este pedido ya está siendo procesado o ya fue confirmado',
          );
        }

        const pricedOrder =
          await tx.order.findUniqueOrThrow({
            where: {
              id:
                order.id,
            },

            include: {
              items:
                true,
            },
          });

        const subtotalCents =
          pricedOrder.items.reduce(
            (
              total,
              item,
            ) =>
              total +
              Math.round(
                item.lineTotal *
                  100,
              ),
            0,
          );

        const discountCents =
          pricedOrder.items.reduce(
            (
              total,
              item,
            ) =>
              total +
              Math.round(
                item.discount *
                  100,
              ),
            0,
          );

        const totalCents =
          pricedOrder.items.reduce(
            (
              total,
              item,
            ) =>
              total +
              Math.round(
                item.total *
                  100,
              ),
            0,
          );

        if (
          subtotalCents !==
            Math.round(
              pricedOrder.subtotal *
                100,
            ) ||
          discountCents !==
            Math.round(
              pricedOrder.discount *
                100,
            ) ||
          totalCents !==
            Math.round(
              pricedOrder.total *
                100,
            ) ||
          subtotalCents -
              discountCents !==
            totalCents
        ) {
          throw new BadRequestException(
            'Los totales del pedido no coinciden con sus descuentos',
          );
        }

        const inventoryEffects: Array<{
          product: string;
          type: string;
          detail: string;
        }> = [];

        /*
         * =================================================
         * INVENTARIO
         * =================================================
         */
        for (
          const orderItem
          of order.items
        ) {
          const product =
            await tx.product.findUniqueOrThrow({
              where: {
                id:
                  orderItem.productId,
              },
            });

          /*
           * Buscamos receta.
           *
           * Tener receta es OPCIONAL.
           */
          const recipe =
            await tx.productRecipe.findUnique({
              where: {
                productId:
                  product.id,
              },

              include: {
                components: {
                  include: {
                    inventoryItem:
                      true,
                  },
                },
              },
            });

          /*
           * =================================================
           * CASO 1
           * RECETA ACTIVA
           * =================================================
           */
          if (
            recipe &&
            recipe.status ===
              'active'
          ) {
            if (
              recipe.yieldQuantity <=
              0
            ) {
              throw new BadRequestException(
                `La receta de ${product.name} tiene un rendimiento inválido`,
              );
            }

            for (
              const component
              of recipe.components
            ) {
              const requiredQuantity =
                (
                  component.quantity /
                  recipe.yieldQuantity
                ) *
                orderItem.quantity;

              /*
               * Solo descontamos si hay
               * suficiente existencia.
               */
              const result =
                await tx.inventoryItem.updateMany({
                  where: {
                    id:
                      component.inventoryItemId,

                    companyId:
                      order.companyId,

                    quantity: {
                      gte:
                        requiredQuantity,
                    },
                  },

                  data: {
                    quantity: {
                      decrement:
                        requiredQuantity,
                    },
                  },
                });

              if (
                result.count === 0
              ) {
                throw new BadRequestException(
                  `No hay suficiente existencia de ${component.inventoryItem.name}`,
                );
              }

              const updatedInventory =
                await tx.inventoryItem.findUniqueOrThrow({
                  where: {
                    id:
                      component.inventoryItemId,
                  },
                });

              /*
               * Historial del consumo.
               */
              await tx.stockMovement.create({
                data: {
                  direction:
                    'out',

                  reason:
                    'recipe_consumption',

                  quantity:
                    requiredQuantity,

                  balanceAfter:
                    updatedInventory.quantity,

                  reference:
                    order.orderNumber,

                  notes:
                    `Pedido ${order.orderNumber}: ${orderItem.quantity} x ${product.name}`,

                  companyId:
                    order.companyId,

                  inventoryItemId:
                    component.inventoryItemId,
                },
              });

              inventoryEffects.push({
                product:
                  product.name,

                type:
                  'recipe',

                detail:
                  `${component.inventoryItem.name}: -${requiredQuantity} ${component.inventoryItem.unit}`,
              });
            }

            /*
             * Como ya utilizamos receta,
             * NO descontamos el stock directo
             * del producto.
             */
            continue;
          }

          /*
           * =================================================
           * CASO 2
           * PRODUCTO SIN RECETA
           * =================================================
           *
           * Si trackInventory = false,
           * no hacemos nada.
           */
          if (
            !product.trackInventory
          ) {
            continue;
          }

          /*
           * Product.stock y ProductVariant.stock
           * actualmente son enteros.
           */
          if (
            !Number.isInteger(
              orderItem.quantity,
            )
          ) {
            throw new BadRequestException(
              `${product.name} utiliza stock por pieza y necesita una cantidad entera`,
            );
          }

          /*
           * -------------------------------------------------
           * VARIANTE
           * -------------------------------------------------
           */
          if (
            orderItem.variantId
          ) {
            const variant =
              await tx.productVariant.findUnique({
                where: {
                  id:
                    orderItem.variantId,
                },
              });

            if (
              !variant ||
              variant.productId !==
                product.id
            ) {
              throw new BadRequestException(
                `La variante de ${product.name} no es válida`,
              );
            }

            const result =
              await tx.productVariant.updateMany({
                where: {
                  id:
                    variant.id,

                  productId:
                    product.id,

                  stock: {
                    gte:
                      orderItem.quantity,
                  },
                },

                data: {
                  stock: {
                    decrement:
                      orderItem.quantity,
                  },
                },
              });

            if (
              result.count === 0
            ) {
              throw new BadRequestException(
                `No hay existencia suficiente de ${product.name} - ${variant.name}`,
              );
            }

            const updatedVariant =
              await tx.productVariant.findUniqueOrThrow({
                where: {
                  id:
                    variant.id,
                },
              });

            inventoryEffects.push({
              product:
                product.name,

              type:
                'variant',

              detail:
                `${variant.name}: -${orderItem.quantity}. Quedan ${updatedVariant.stock}`,
            });

            continue;
          }

          /*
           * -------------------------------------------------
           * STOCK DIRECTO DEL PRODUCTO
           * -------------------------------------------------
           */
          const productStockResult =
            await tx.product.updateMany({
              where: {
                id:
                  product.id,

                stock: {
                  gte:
                    orderItem.quantity,
                },
              },

              data: {
                stock: {
                  decrement:
                    orderItem.quantity,
                },
              },
            });

          if (
            productStockResult.count ===
            0
          ) {
            throw new BadRequestException(
              `No hay existencia suficiente de ${product.name}`,
            );
          }

          const updatedProduct =
            await tx.product.findUniqueOrThrow({
              where: {
                id:
                  product.id,
              },
            });

          inventoryEffects.push({
            product:
              product.name,

            type:
              'product',

            detail:
              `Stock: -${orderItem.quantity}. Quedan ${updatedProduct.stock}`,
          });
        }

        /*
         * =================================================
         * FIDELIZACIÓN
         * =================================================
         *
         * Es completamente opcional.
         */
        let loyalty: LoyaltyResult =
          null;

        if (
          order.customerId &&
          order.loyaltyProgramId
        ) {
          const program =
            await tx.loyaltyProgram.findUnique({
              where: {
                id:
                  order.loyaltyProgramId,
              },
            });

          if (!program) {
            throw new NotFoundException(
              'La campaña de fidelización ya no existe',
            );
          }

          const now =
            new Date();

          /*
           * Solo cuenta si está activa
           * y dentro de fechas.
           */
          if (
            program.status ===
              'active' &&
            now >=
              program.startsAt &&
            now <=
              program.endsAt
          ) {
            /*
             * Una orden completa =
             * una visita.
             */
            await tx.visit.create({
              data: {
                customerId:
                  order.customerId,

                companyId:
                  order.companyId,

                loyaltyProgramId:
                  program.id,

                source:
                  'order',

                status:
                  'confirmed',

                notes:
                  `Pedido ${order.orderNumber}`,
              },
            });

            const confirmedVisits =
              await tx.visit.count({
                where: {
                  customerId:
                    order.customerId,

                  loyaltyProgramId:
                    program.id,

                  status:
                    'confirmed',
                },
              });

            let reward =
              await tx.customerReward.findFirst({
                where: {
                  customerId:
                    order.customerId,

                  loyaltyProgramId:
                    program.id,
                },
              });

            let rewardCreated =
              false;

            /*
             * Creamos premio cuando alcanza
             * las visitas necesarias.
             */
            if (
              confirmedVisits >=
                program.requiredVisits &&
              !reward
            ) {
              const expiresAt =
                new Date();

              expiresAt.setUTCDate(
                expiresAt.getUTCDate() +
                  program.rewardValidDays,
              );

              reward =
                await tx.customerReward.create({
                  data: {
                    rewardType:
                      program.rewardType,

                    rewardDescription:
                      program.rewardDescription,

                    status:
                      'available',

                    expiresAt,

                    customerId:
                      order.customerId,

                    companyId:
                      order.companyId,

                    loyaltyProgramId:
                      program.id,
                  },
                });

              rewardCreated =
                true;
            }

            loyalty = {
              confirmedVisits,

              requiredVisits:
                program.requiredVisits,

              remainingVisits:
                Math.max(
                  program.requiredVisits -
                    confirmedVisits,
                  0,
                ),

              rewardCreated,

              reward,
            };
          }
        }

        /*
         * =================================================
         * CONFIRMAMOS EL PEDIDO
         * =================================================
         */
        const confirmedOrder =
          await tx.order.update({
            where: {
              id:
                order.id,
            },

            data: {
              status:
                'confirmed',

              confirmedAt:
                new Date(),
            },

            include: {
              customer:
                true,

              items:
                true,
            },
          });

        return {
          order:
            confirmedOrder,

          inventoryEffects,

          loyalty,
        };
      },
    );
  }
  async getTicket(
  id: string,
) {
  const order =
    await this.prisma.order.findUnique({
      where: {
        id,
      },

      include: {
        company: true,
        customer: true,

        items: {
          include: {
            variant: true,
          },
        },

        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: true,
            voidedBy: true,
          },

          orderBy: {
            appliedAt: 'asc',
          },
        },

        payments: {
          where: {
            status: 'completed',
          },

          orderBy: {
            paidAt: 'asc',
          },
        },
      },
    });

  if (!order) {
    throw new NotFoundException(
      'El pedido no existe',
    );
  }

  const totalPaid =
    order.payments.reduce(
      (
        accumulator,
        payment,
      ) =>
        accumulator +
        payment.amount,
      0,
    );

  const remaining =
    Math.max(
      Math.round(
        (
          order.total -
          totalPaid
        ) *
          100,
      ) / 100,
      0,
    );

  const totalChange =
    order.payments.reduce(
      (
        accumulator,
        payment,
      ) =>
        accumulator +
        payment.changeAmount,
      0,
    );

  return {
    ticket: {
      orderNumber:
        order.orderNumber,

      status:
        order.status,

      paymentStatus:
        order.paymentStatus,

      date:
        order.confirmedAt ??
        order.createdAt,

      business: {
        id:
          order.company.id,

        name:
          order.company.name,
      },

      customer:
        order.customer
          ? {
              id:
                order.customer.id,

              name:
                order.customer.name,

              phone:
                order.customer.phone,
            }
          : null,

      items:
        order.items.map(
          (item) => ({
            name:
              item.productName,

            variant:
              item.variant?.name ??
              null,

            sku:
              item.sku,

            quantity:
              item.quantity,

            unitPrice:
              item.unitPrice,

            subtotal:
              item.lineTotal,

            discount:
              item.discount,

            total:
              item.total,
          }),
        ),

      discounts:
        order.discounts.map(
          (discount) => ({
            id:
              discount.id,

            scope:
              discount.scope,

            source:
              discount.source,

            type:
              discount.type,

            value:
              discount.value,

            amount:
              discount.amount,

            reason:
              discount.reason,

            status:
              discount.status,

            product:
              discount.orderItem?.productName ??
              null,

            promotion:
              discount.promotion?.title ??
              null,

            authorizedBy:
              discount.authorizedBy.name,

            voidedBy:
              discount.voidedBy?.name ??
              null,
          }),
        ),

      totals: {
        subtotal:
          order.subtotal,

        discount:
          order.discount,

        total:
          order.total,

        paid:
          Math.round(
            totalPaid * 100,
          ) / 100,

        remaining,

        change:
          Math.round(
            totalChange * 100,
          ) / 100,
      },

      payments:
        order.payments.map(
          (payment) => ({
            method:
              payment.method,

            amount:
              payment.amount,

            receivedAmount:
              payment.receivedAmount,

            change:
              payment.changeAmount,

            reference:
              payment.reference,

            paidAt:
              payment.paidAt,
          }),
        ),
    },
  };
}
}
