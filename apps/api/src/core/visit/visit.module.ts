import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { VisitController } from './visit.controller';
import { VisitService } from './visit.service';

@Module({
  imports: [AuthModule],
  controllers: [VisitController],
  providers: [VisitService],
  exports: [VisitService],
})
export class VisitModule {}
