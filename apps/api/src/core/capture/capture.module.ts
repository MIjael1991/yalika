import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { CaptureController } from './capture.controller';
import { CaptureService } from './capture.service';

@Module({
  imports: [AuthModule],
  controllers: [CaptureController],
  providers: [CaptureService],
})
export class CaptureModule {}
