import { Module } from '@nestjs/common';

import { DiningTableController } from './dining-table.controller';
import { DiningTableService } from './dining-table.service';

@Module({
  controllers: [
    DiningTableController,
  ],

  providers: [
    DiningTableService,
  ],

  exports: [
    DiningTableService,
  ],
})
export class DiningTableModule {}