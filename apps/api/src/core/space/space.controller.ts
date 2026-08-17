import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { type AuthContext } from '../../auth/auth.types';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { AddSpaceMemberDto } from './dto/add-space-member.dto';
import { CreateSpaceDto } from './dto/create-space.dto';
import { SpaceService } from './space.service';

@Controller('space')
@UseGuards(SessionAuthGuard)
export class SpaceController {
  constructor(private readonly spaceService: SpaceService) {}

  @Get()
  findForUser(@CurrentAuth() auth: AuthContext) {
    return this.spaceService.findForUser(auth.user.id);
  }

  @Post()
  create(@Body() dto: CreateSpaceDto, @CurrentAuth() auth: AuthContext) {
    return this.spaceService.create(dto, auth.user);
  }

  @Post(':spaceId/member')
  addMember(
    @Param('spaceId') spaceId: string,
    @Body() dto: AddSpaceMemberDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.spaceService.addMember(spaceId, dto, auth.user.id);
  }
}
