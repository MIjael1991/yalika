import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { SpaceController } from './space.controller';
import { SpaceService } from './space.service';

@Module({
  imports: [AuthModule],
  controllers: [SpaceController],
  providers: [SpaceService],
})
export class SpaceModule {}
