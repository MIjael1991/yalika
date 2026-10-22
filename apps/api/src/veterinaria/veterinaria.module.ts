import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VeterinariaFeatureGuard } from './veterinaria-feature.guard';
import { VeterinariaController } from './veterinaria.controller';
import { VeterinariaService } from './veterinaria.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [VeterinariaController],
  providers: [VeterinariaService, VeterinariaFeatureGuard],
})
export class VeterinariaModule {}
