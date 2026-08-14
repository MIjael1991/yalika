import { Module } from '@nestjs/common';
import { OrderDiscountController } from './order-discount.controller';
import { OrderDiscountService } from './order-discount.service';

@Module({
  controllers: [OrderDiscountController],
  providers: [OrderDiscountService],
  exports: [OrderDiscountService],
})
export class OrderDiscountModule {}
