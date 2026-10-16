import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PosInventoryService } from './pos-inventory.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, PosInventoryService],
  exports: [CatalogService],
})
export class CatalogModule {}