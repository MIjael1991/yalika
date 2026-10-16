import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CreateDiningTableDto } from './dto/create-dining-table.dto';
import { UpdateDiningTableStatusDto } from './dto/update-dining-table-status.dto';
import { DiningTableService } from './dining-table.service';

@Controller('dining-table')
export class DiningTableController {
  constructor(private readonly diningTableService: DiningTableService) {}

  @Post()
  create(@Body() dto: CreateDiningTableDto) {
    return this.diningTableService.create(dto);
  }

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.diningTableService.findByCompany(companyId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDiningTableStatusDto,
  ) {
    return this.diningTableService.updateStatus(id, dto);
  }

  @Post(':tableId/assign-order/:orderId')
  assignOrder(
    @Param('tableId') tableId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.diningTableService.assignOrder(tableId, orderId);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.diningTableService.release(id);
  }
}
