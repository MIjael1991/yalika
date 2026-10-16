import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import { ConsumeRecipeDto } from './dto/consume-recipe.dto';
import { SaveRecipeDto } from './dto/save-recipe.dto';
import { RecipeService } from './recipe.service';

@Controller('recipe')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.recipeService.findByProduct(productId);
  }

  @Put('product/:productId')
  saveRecipe(
    @Param('productId') productId: string,
    @Body() dto: SaveRecipeDto,
  ) {
    return this.recipeService.saveRecipe(productId, dto);
  }

  @Post('product/:productId/enable')
  enable(@Param('productId') productId: string) {
    return this.recipeService.enable(productId);
  }

  @Post('product/:productId/disable')
  disable(@Param('productId') productId: string) {
    return this.recipeService.disable(productId);
  }

  @Post('product/:productId/consume')
  consume(
    @Param('productId') productId: string,
    @Body() dto: ConsumeRecipeDto,
  ) {
    return this.recipeService.consume(productId, dto);
  }
}
