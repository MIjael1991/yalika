import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { PublicRegistrationController } from './public-registration.controller';
import { AccountSecurityController } from './account-security.controller';
import { AuthService } from './auth.service';
import { PublicRegistrationService } from './public-registration.service';
import { AccountSecurityService } from './account-security.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [
    AuthController,
    AccountSecurityController,
    PublicRegistrationController,
  ],
  providers: [
    AuthService,
    AccountSecurityService,
    SessionAuthGuard,
    PublicRegistrationService,
  ],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
