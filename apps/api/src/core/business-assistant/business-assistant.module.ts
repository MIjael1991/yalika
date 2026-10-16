import { WritingAssistant } from './writing-assistant';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { Module } from '@nestjs/common';
import { BusinessAssistantController } from './business-assistant.controller';
import { BusinessAssistantService } from './business-assistant.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [BusinessAssistantController],
  providers: [BusinessAssistantService, WritingAssistant],
})
export class BusinessAssistantModule {}
