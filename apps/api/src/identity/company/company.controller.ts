import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  assertOwnCompany,
  requireCompanyAdministrator,
} from '../../auth/tenant-policy';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@Controller('company')
@UseGuards(SessionAuthGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    return this.companyService.findAll(auth.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    assertOwnCompany(auth, id);
    return this.companyService.findOne(id);
  }

  @Post()
  create(
    @Body() createCompanyDto: CreateCompanyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCompanyAdministrator(auth);
    return this.companyService.create(createCompanyDto.name);
  }
}
