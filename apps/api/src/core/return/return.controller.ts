import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ReturnService } from './return.service';

@Controller('return')
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Post()
  create(@Body() dto: CreateReturnDto) {
    return this.returnService.create(dto);
  }

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.returnService.findByCompany(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnService.findOne(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.returnService.confirm(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.returnService.cancel(id);
  }

  @Post(':id/refund')
  createRefund(@Param('id') id: string, @Body() dto: CreateRefundDto) {
    return this.returnService.createRefund(id, dto);
  }
}
