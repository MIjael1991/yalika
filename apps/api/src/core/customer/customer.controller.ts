import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
  ) {}

  @Get()
  findAll() {
    return this.customerService.findAll();
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.customerService.findByCompany(
      companyId,
    );
  }

  @Post()
  create(
    @Body() createCustomerDto: CreateCustomerDto,
  ) {
    return this.customerService.create(
      createCustomerDto,
    );
  }
}