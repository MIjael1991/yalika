import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { AddSpaceMemberDto } from './dto/add-space-member.dto';
import { CreateSpaceDto } from './dto/create-space.dto';
import { SpaceService } from './space.service';

@Controller('space')
export class SpaceController {
  constructor(private readonly spaceService: SpaceService) {}

  @Get('user/:userId')
  findForUser(@Param('userId') userId: string) {
    return this.spaceService.findForUser(userId);
  }

  @Post()
  create(@Body() dto: CreateSpaceDto) {
    return this.spaceService.create(dto);
  }

  @Post(':spaceId/member')
  addMember(
    @Param('spaceId') spaceId: string,
    @Body() dto: AddSpaceMemberDto,
  ) {
    return this.spaceService.addMember(spaceId, dto);
  }
}
