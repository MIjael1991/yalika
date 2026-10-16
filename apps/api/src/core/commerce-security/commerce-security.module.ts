import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommerceAccessGuard } from './commerce-access.guard';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [{ provide: APP_GUARD, useClass: CommerceAccessGuard }],
})
export class CommerceSecurityModule {}
