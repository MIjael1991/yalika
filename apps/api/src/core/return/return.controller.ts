import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { itemReturnProductIds } from '../../auth/permissions';
import { isCashier } from '../../auth/tenant-policy';

import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ReturnService, type ReturnScope } from './return.service';

/** Un cajero sin el permiso general solo puede devolver los productos autorizados. */
function scopeOf(auth: AuthContext): ReturnScope {
  const general = auth.user.permissions?.includes('returns') ?? false;
  return {
    actorId: auth.user.id,
    onlyProductIds:
      isCashier(auth) && !general
        ? itemReturnProductIds(auth.user.permissions)
        : null,
  };
}

@Controller('return')
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentAuth() auth: AuthContext) {
    return this.returnService.create(dto, scopeOf(auth));
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
  confirm(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.returnService.confirm(id, scopeOf(auth));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.returnService.cancel(id, scopeOf(auth));
  }

  @Post(':id/refund')
  createRefund(@Param('id') id: string, @Body() dto: CreateRefundDto) {
    return this.returnService.createRefund(id, dto);
  }
}
