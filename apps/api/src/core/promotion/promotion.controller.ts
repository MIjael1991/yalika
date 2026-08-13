import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionService } from './promotion.service';

@Controller('promotion')
export class PromotionController {
  constructor(
    private readonly promotionService: PromotionService,
  ) {}

  @Post()
  create(
    @Body() dto: CreatePromotionDto,
  ) {
    return this.promotionService.create(dto);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.promotionService.findByCompany(
      companyId,
    );
  }

  @Get('public/company/:companyId')
  findPublicByCompany(
    @Param('companyId') companyId: string,
  ) {
    return this.promotionService.findPublicByCompany(
      companyId,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.promotionService.findOne(id);
  }

  @Post(':id/activate')
  activate(
    @Param('id') id: string,
  ) {
    return this.promotionService.activate(id);
  }

  @Post(':id/pause')
  pause(
    @Param('id') id: string,
  ) {
    return this.promotionService.pause(id);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
  ) {
    return this.promotionService.close(id);
  }

  @Delete(':id')
  removeDraft(
    @Param('id') id: string,
  ) {
    return this.promotionService.removeDraft(id);
  }
}