import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orderService.create(dto);
  }

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.orderService.findByCompany(companyId);
  }

  @Get('company/:companyId/report')
  salesReport(
    @Param('companyId') companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tz') tz?: string,
  ) {
    return this.orderService.salesReport(companyId, from, to, tz);
  }

  @Get(':id/ticket')
  getTicket(@Param('id') id: string) {
    return this.orderService.getTicket(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.orderService.confirm(id);
  }

  @Post('company/:companyId/expire-abandoned')
  expireAbandoned(@Param('companyId') companyId: string) {
    return this.orderService.expireAbandoned(companyId);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.orderService.cancel(id, body.reason);
  }
}
