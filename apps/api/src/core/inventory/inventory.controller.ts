import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { InventoryService } from './inventory.service';

import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('supplier')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.inventoryService.createSupplier(dto);
  }

  @Get('supplier/company/:companyId')
  findSuppliersByCompany(@Param('companyId') companyId: string) {
    return this.inventoryService.findSuppliersByCompany(companyId);
  }

  @Post('item')
  createItem(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @Get('item/company/:companyId')
  findItemsByCompany(@Param('companyId') companyId: string) {
    return this.inventoryService.findItemsByCompany(companyId);
  }

  @Post('movement')
  createMovement(@Body() dto: CreateStockMovementDto) {
    return this.inventoryService.createMovement(dto);
  }

  @Get('movement/item/:itemId')
  findMovementsByItem(@Param('itemId') itemId: string) {
    return this.inventoryService.findMovementsByItem(itemId);
  }

  @Get('movement/company/:companyId')
  findMovementsByCompany(@Param('companyId') companyId: string) {
    return this.inventoryService.findMovementsByCompany(companyId);
  }

  @Post('count')
  countInventory(@Body() dto: CreateInventoryCountDto) {
    return this.inventoryService.countInventory(dto);
  }

  @Post('receipt')
  createReceipt(@Body() dto: CreateStockReceiptDto) {
    return this.inventoryService.createReceipt(dto);
  }

  @Get('receipt/company/:companyId')
  findReceiptsByCompany(@Param('companyId') companyId: string) {
    return this.inventoryService.findReceiptsByCompany(companyId);
  }
}
