import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApplyOrderDiscountDto } from './dto/apply-order-discount.dto';
import { VoidOrderDiscountDto } from './dto/void-order-discount.dto';
import { OrderDiscountService } from './order-discount.service';

@Controller('discount')
export class OrderDiscountController {
  constructor(private readonly orderDiscountService: OrderDiscountService) {}

  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string) {
    return this.orderDiscountService.findByOrder(orderId);
  }

  @Post('order/:orderId')
  apply(
    @Param('orderId') orderId: string,
    @Body() dto: ApplyOrderDiscountDto,
  ) {
    return this.orderDiscountService.apply(orderId, dto);
  }

  @Post(':id/void')
  voidDiscount(@Param('id') id: string, @Body() dto: VoidOrderDiscountDto) {
    return this.orderDiscountService.voidDiscount(id, dto);
  }
}
