import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateVisitDto } from './dto/create-visit.dto';
import { VisitService } from './visit.service';

@Controller('visit')
export class VisitController {
  constructor(
    private readonly visitService: VisitService,
  ) {}

  @Get()
  findAll() {
    return this.visitService.findAll();
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.visitService.findByCompany(companyId);
  }

  @Get('customer/:customerId')
  findByCustomer(
    @Param('customerId') customerId: string,
  ) {
    return this.visitService.findByCustomer(customerId);
  }

  @Get('customer/:customerId/count')
  countByCustomer(
    @Param('customerId') customerId: string,
  ) {
    return this.visitService.countByCustomer(customerId);
  }

  @Post()
  create(
    @Body() createVisitDto: CreateVisitDto,
  ) {
    return this.visitService.create(createVisitDto);
  }
}