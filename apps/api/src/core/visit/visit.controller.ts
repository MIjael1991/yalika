import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  assertOwnCompany,
  requireCommercialAccount,
  requireCompanyAdministrator,
} from '../../auth/tenant-policy';

import { CreateVisitDto } from './dto/create-visit.dto';
import { VisitService } from './visit.service';

@Controller('visit')
@UseGuards(SessionAuthGuard)
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    requireCommercialAccount(auth);
    return this.visitService.findAll(auth.user.companyId);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    assertOwnCompany(auth, companyId);
    return this.visitService.findByCompany(companyId);
  }

  @Get('customer/:customerId')
  findByCustomer(
    @Param('customerId') customerId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    return this.visitService.findByCustomer(customerId, auth.user.companyId);
  }

  @Get('customer/:customerId/count')
  countByCustomer(
    @Param('customerId') customerId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCommercialAccount(auth);
    return this.visitService.countByCustomer(customerId, auth.user.companyId);
  }

  @Post()
  create(
    @Body() createVisitDto: CreateVisitDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCompanyAdministrator(auth);
    assertOwnCompany(auth, createVisitDto.companyId);
    return this.visitService.create(createVisitDto);
  }
}
