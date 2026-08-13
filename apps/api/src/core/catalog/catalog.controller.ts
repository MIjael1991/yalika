import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CatalogService } from './catalog.service';

import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
  ) {}

  @Post('category')
  createCategory(
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalogService.createCategory(dto);
  }

  @Get('category/company/:companyId')
  findCategoriesByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.catalogService.findCategoriesByCompany(
      companyId,
    );
  }

  @Post('product')
  createProduct(
    @Body() dto: CreateProductDto,
  ) {
    return this.catalogService.createProduct(dto);
  }

  @Get('product/company/:companyId')
  findProductsByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.catalogService.findProductsByCompany(
      companyId,
    );
  }

  @Get('product/:id')
  findProduct(
    @Param('id') id: string,
  ) {
    return this.catalogService.findProduct(id);
  }

  @Post('product/:id/variant')
  addVariant(
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.catalogService.addVariant(
      id,
      dto,
    );
  }

  @Post('product/:id/image')
  addImage(
    @Param('id') id: string,
    @Body() dto: CreateImageDto,
  ) {
    return this.catalogService.addImage(
      id,
      dto,
    );
  }

  @Patch('product/:id/stock')
  updateProductStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.catalogService.updateProductStock(
      id,
      dto,
    );
  }

  @Patch('variant/:id/stock')
  updateVariantStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.catalogService.updateVariantStock(
      id,
      dto,
    );
  }
}