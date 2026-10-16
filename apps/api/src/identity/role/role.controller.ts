import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  assertOwnCompany,
  requireCompanyAdministrator,
} from '../../auth/tenant-policy';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleService } from './role.service';

@Controller('role')
@UseGuards(SessionAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  findAll(@CurrentAuth() auth: AuthContext) {
    requireCompanyAdministrator(auth);
    return this.roleService.findAll(auth.user.companyId);
  }

  @Post()
  create(
    @Body() createRoleDto: CreateRoleDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    requireCompanyAdministrator(auth);
    assertOwnCompany(auth, createRoleDto.companyId);
    return this.roleService.create(createRoleDto);
  }
}
