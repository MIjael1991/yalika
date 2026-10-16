import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty-program')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.loyaltyService.findByCompany(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.loyaltyService.findOne(id);
  }

  @Get(':id/progress/:customerId')
  progress(@Param('id') id: string, @Param('customerId') customerId: string) {
    return this.loyaltyService.progress(id, customerId);
  }

  @Post()
  create(
    @Body()
    createLoyaltyProgramDto: CreateLoyaltyProgramDto,
  ) {
    return this.loyaltyService.create(createLoyaltyProgramDto);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.loyaltyService.activate(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.loyaltyService.pause(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.loyaltyService.close(id);
  }
}
