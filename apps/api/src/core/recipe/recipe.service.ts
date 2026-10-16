import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ConsumeRecipeDto } from './dto/consume-recipe.dto';
import { SaveRecipeDto } from './dto/save-recipe.dto';

@Injectable()
export class RecipeService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto o servicio no existe');
    }

    const recipe = await this.prisma.productRecipe.findUnique({
      where: {
        productId,
      },

      include: {
        components: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    return {
      product,
      hasRecipe: Boolean(recipe),
      recipe,
    };
  }

  async saveRecipe(productId: string, dto: SaveRecipeDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto o servicio no existe');
    }

    const inventoryIds = dto.components.map(
      (component) => component.inventoryItemId,
    );

    const uniqueInventoryIds = new Set(inventoryIds);

    if (uniqueInventoryIds.size !== inventoryIds.length) {
      throw new BadRequestException(
        'Un ingrediente no puede repetirse dentro de la misma receta',
      );
    }

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        id: {
          in: inventoryIds,
        },

        companyId: product.companyId,
      },
    });

    if (inventoryItems.length !== inventoryIds.length) {
      throw new BadRequestException(
        'Uno o más artículos de inventario no existen o pertenecen a otra empresa',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existingRecipe = await tx.productRecipe.findUnique({
        where: {
          productId,
        },
      });

      let recipe;

      if (existingRecipe) {
        await tx.productRecipeComponent.deleteMany({
          where: {
            recipeId: existingRecipe.id,
          },
        });

        recipe = await tx.productRecipe.update({
          where: {
            id: existingRecipe.id,
          },

          data: {
            name: dto.name?.trim(),

            notes: dto.notes?.trim(),

            yieldQuantity: dto.yieldQuantity ?? 1,

            components: {
              create: dto.components.map((component) => ({
                inventoryItemId: component.inventoryItemId,

                quantity: component.quantity,
              })),
            },
          },

          include: {
            components: {
              include: {
                inventoryItem: true,
              },
            },
          },
        });
      } else {
        recipe = await tx.productRecipe.create({
          data: {
            name: dto.name?.trim(),

            notes: dto.notes?.trim(),

            yieldQuantity: dto.yieldQuantity ?? 1,

            status: 'active',

            productId,

            components: {
              create: dto.components.map((component) => ({
                inventoryItemId: component.inventoryItemId,

                quantity: component.quantity,
              })),
            },
          },

          include: {
            components: {
              include: {
                inventoryItem: true,
              },
            },
          },
        });
      }

      return recipe;
    });
  }

  async enable(productId: string) {
    const recipe = await this.prisma.productRecipe.findUnique({
      where: {
        productId,
      },
    });

    if (!recipe) {
      throw new NotFoundException('Este producto todavía no tiene receta');
    }

    return this.prisma.productRecipe.update({
      where: {
        id: recipe.id,
      },

      data: {
        status: 'active',
      },
    });
  }

  async disable(productId: string) {
    const recipe = await this.prisma.productRecipe.findUnique({
      where: {
        productId,
      },
    });

    if (!recipe) {
      throw new NotFoundException('Este producto todavía no tiene receta');
    }

    return this.prisma.productRecipe.update({
      where: {
        id: recipe.id,
      },

      data: {
        status: 'disabled',
      },
    });
  }

  async consume(productId: string, dto: ConsumeRecipeDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product) {
      throw new NotFoundException('El producto o servicio no existe');
    }

    const recipe = await this.prisma.productRecipe.findUnique({
      where: {
        productId,
      },

      include: {
        components: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    /*
     * La receta es OPCIONAL.
     * No tener receta no debe bloquear una venta.
     */
    if (!recipe) {
      return {
        applied: false,
        reason: 'recipe_not_configured',
        productId,
        productName: product.name,
      };
    }

    /*
     * También puede existir, pero estar apagada.
     */
    if (recipe.status !== 'active') {
      return {
        applied: false,
        reason: 'recipe_disabled',
        productId,
        productName: product.name,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const consumptions: Array<{
        inventoryItemId: string;
        name: string;
        consumed: number;
        unit: string;
        balanceAfter: number;
      }> = [];

      for (const component of recipe.components) {
        const requiredQuantity =
          (component.quantity / recipe.yieldQuantity) * dto.quantitySold;

        const result = await tx.inventoryItem.updateMany({
          where: {
            id: component.inventoryItemId,

            companyId: product.companyId,

            quantity: {
              gte: requiredQuantity,
            },
          },

          data: {
            quantity: {
              decrement: requiredQuantity,
            },
          },
        });

        if (result.count === 0) {
          throw new BadRequestException(
            `No hay suficiente existencia de ${component.inventoryItem.name}`,
          );
        }

        const updatedItem = await tx.inventoryItem.findUniqueOrThrow({
          where: {
            id: component.inventoryItemId,
          },
        });

        await tx.stockMovement.create({
          data: {
            direction: 'out',

            reason: 'recipe_consumption',

            quantity: requiredQuantity,

            balanceAfter: updatedItem.quantity,

            notes: `Consumo por ${dto.quantitySold} x ${product.name}`,

            companyId: product.companyId,

            inventoryItemId: component.inventoryItemId,
          },
        });

        consumptions.push({
          inventoryItemId: updatedItem.id,

          name: updatedItem.name,

          consumed: requiredQuantity,

          unit: updatedItem.unit,

          balanceAfter: updatedItem.quantity,
        });
      }

      return {
        applied: true,

        product: {
          id: product.id,
          name: product.name,
        },

        quantitySold: dto.quantitySold,

        consumptions,
      };
    });
  }
}
