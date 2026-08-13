import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.create(dto);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.orderService.findByCompany(
      companyId,
    );
  }

  @Get(':id/ticket')
getTicket(
  @Param('id') id: string,
) {
  return this.orderService.getTicket(
    id,
  );
}

  @Get(':id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.orderService.findOne(id);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
  ) {
    return this.orderService.confirm(id);
  }
}