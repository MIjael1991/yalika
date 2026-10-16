import { ForbiddenException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CatalogService } from './catalog.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { AuthContext } from '../../auth/auth.types';
import { PosInventoryService } from './pos-inventory.service';
import { ReceiveProductsDto, SetVisibilityDto } from './dto/pos-inventory.dto';

import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateProductBarcodeDto } from './dto/barcode.dto';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly posInventoryService: PosInventoryService,
  ) {}

  @Get('commerce/company/:companyId')
  listCommerceCatalogs(@Param('companyId') companyId: string, @CurrentAuth() auth: AuthContext) {
    if (companyId !== auth.user.companyId) throw new ForbiddenException('Empresa no autorizada');
    return this.catalogService.listCatalogs(companyId);
  }

  @Post('commerce/company/:companyId')
  createCommerceCatalog(@Param('companyId') companyId: string, @Body() body: { name: string }, @CurrentAuth() auth: AuthContext) {
    if (companyId !== auth.user.companyId) throw new ForbiddenException('Empresa no autorizada');
    return this.catalogService.createCommerceCatalog(companyId, body.name);
  }

  @Patch('commerce/company/:companyId/product/:productId')
  changeProductCatalog(@Param('companyId') companyId: string, @Param('productId') productId: string, @Body() body: { catalogId: string }, @CurrentAuth() auth: AuthContext) {
    if (companyId !== auth.user.companyId) throw new ForbiddenException('Empresa no autorizada');
    return this.catalogService.assignProductCatalog(companyId, productId, body.catalogId);
  }

  @Patch('commerce/company/:companyId/category/:categoryId')
  changeCategoryCatalog(@Param('companyId') companyId: string, @Param('categoryId') categoryId: string, @Body() body: { catalogId: string }, @CurrentAuth() auth: AuthContext) {
    if (companyId !== auth.user.companyId) throw new ForbiddenException('Empresa no autorizada');
    return this.catalogService.assignCategoryCatalog(companyId, categoryId, body.catalogId);
  }

  // Las rutas fijas se definen antes de los parámetros para facilitar mantenimiento.
  @Post('receipt')
  receiveProducts(@Body() dto: ReceiveProductsDto, @CurrentAuth() auth: AuthContext) {
    return this.posInventoryService.receive(dto, auth.user);
  }

  @Get('receipt/company/:companyId')
  getReceipts(@Param('companyId') companyId: string, @CurrentAuth() auth: AuthContext) {
    return this.posInventoryService.listReceipts(companyId, auth.user);
  }

  @Patch('products/visibility')
  setVisibility(@Body() dto: SetVisibilityDto, @CurrentAuth() auth: AuthContext) {
    return this.posInventoryService.setVisibility(dto, auth.user);
  }

  @Post('category')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Get('category/company/:companyId')
  findCategoriesByCompany(@Param('companyId') companyId: string) {
    return this.catalogService.findCategoriesByCompany(companyId);
  }

  @Post('product')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Get('public/company/:companyId')
  findPublicProductsByCompany(@Param('companyId') companyId: string) {
    return this.catalogService.findPublicProductsByCompany(companyId);
  }

  @Get('product/company/:companyId')
  findProductsByCompany(@Param('companyId') companyId: string) {
    return this.catalogService.findProductsByCompany(companyId);
  }

  @Get('barcode/company/:companyId/:value')
  resolveBarcode(
    @Param('companyId') companyId: string,
    @Param('value') value: string,
  ) {
    return this.catalogService.resolveBarcode(companyId, value);
  }

  @Get('product/:id/barcodes')
  listBarcodes(@Param('id') id: string) {
    return this.catalogService.listBarcodes(id);
  }

  @Post('product/:id/barcodes')
  addBarcode(
    @Param('id') id: string,
    @Body() dto: CreateProductBarcodeDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.catalogService.addBarcode(id, dto, auth.user.companyId);
  }

  @Post('product/:id/barcodes/generate')
  generateBarcode(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.catalogService.generateInternalBarcode(id, auth.user.companyId);
  }

  @Get('product/:id')
  findProduct(@Param('id') id: string) {
    return this.catalogService.findProduct(id);
  }

  @Patch('product/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Post('product/:id/variant')
  addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.catalogService.addVariant(id, dto);
  }

  @Post('product/:id/image')
  addImage(@Param('id') id: string, @Body() dto: CreateImageDto) {
    return this.catalogService.addImage(id, dto);
  }

  @Patch('product/:productId/image/:imageId/primary')
  makeImagePrimary(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.catalogService.makeImagePrimary(productId, imageId);
  }

  @Delete('product/:productId/image/:imageId')
  removeImage(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.catalogService.removeImage(productId, imageId);
  }

  @Patch('product/:id/stock')
  updateProductStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.catalogService.updateProductStock(id, dto);
  }

  @Patch('variant/:id/stock')
  updateVariantStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.catalogService.updateVariantStock(id, dto);
  }

  @Patch('variant/:id')
  updateVariant(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return this.catalogService.updateVariant(id, dto);
  }
}
