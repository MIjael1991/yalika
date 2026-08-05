import { Body, Controller, Get, Post } from '@nestjs/common';
import { CompanyService } from './company.service';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  findAll() {
    return this.companyService.findAll();
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.companyService.create(body.name);
  }
}