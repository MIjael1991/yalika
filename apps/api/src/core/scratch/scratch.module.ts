import { Module } from '@nestjs/common';

import { ScratchController } from './scratch.controller';
import { ScratchService } from './scratch.service';

@Module({
  controllers: [ScratchController],
  providers: [ScratchService],
  exports: [ScratchService],
})
export class ScratchModule {}
