import { Module } from '@nestjs/common';

import { AuthModule } from '../../../auth/auth.module';

import { AlternativeController } from './alternative.controller';
import { AlternativeService } from './alternative.service';

@Module({
  imports: [AuthModule],
  controllers: [AlternativeController],
  providers: [AlternativeService],
})
export class AlternativeModule {}
