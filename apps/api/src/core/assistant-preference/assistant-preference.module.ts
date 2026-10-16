import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AssistantPreferenceController } from './assistant-preference.controller';
import { AssistantPreferenceService } from './assistant-preference.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AssistantPreferenceController],
  providers: [AssistantPreferenceService],
})
export class AssistantPreferenceModule {}
