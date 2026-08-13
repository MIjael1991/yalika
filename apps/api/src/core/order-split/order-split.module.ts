import {
  Module,
} from '@nestjs/common';

import { OrderSplitController } from './order-split.controller';
import { OrderSplitService } from './order-split.service';

@Module({
  controllers: [
    OrderSplitController,
  ],

  providers: [
    OrderSplitService,
  ],

  exports: [
    OrderSplitService,
  ],
})
export class OrderSplitModule {}