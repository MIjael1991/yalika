import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateEqualSplitDto } from './dto/create-equal-split.dto';
import { CreateCustomSplitDto } from './dto/create-custom-split.dto';
import { CreateItemSplitDto } from './dto/create-item-split.dto';

import { OrderSplitService } from './order-split.service';

@Controller('order-split')
export class OrderSplitController {
  constructor(
    private readonly orderSplitService: OrderSplitService,
  ) {}

  @Get('order/:orderId')
  findByOrder(
    @Param('orderId') orderId: string,
  ) {
    return this.orderSplitService.findByOrder(
      orderId,
    );
  }

  @Post('order/:orderId/equal')
  createEqual(
    @Param('orderId') orderId: string,
    @Body() dto: CreateEqualSplitDto,
  ) {
    return this.orderSplitService.createEqual(
      orderId,
      dto,
    );
  }

  @Post('order/:orderId/custom')
  createCustom(
    @Param('orderId') orderId: string,
    @Body() dto: CreateCustomSplitDto,
  ) {
    return this.orderSplitService.createCustom(
      orderId,
      dto,
    );
  }

  @Post('order/:orderId/items')
  createByItems(
    @Param('orderId') orderId: string,
    @Body() dto: CreateItemSplitDto,
  ) {
    return this.orderSplitService.createByItems(
      orderId,
      dto,
    );
  }
}