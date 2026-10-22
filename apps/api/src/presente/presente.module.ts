import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PresenteFeatureGuard } from './presente-feature.guard';
import { PresenteStorageService } from './presente-storage.service';
import { PresenteController } from './presente.controller';
import { PresenteMercadoPagoService } from './presente-mercadopago.service';
import { PresenteSafetyService } from './presente-safety.service';
import { PresenteWebhooksController } from './presente-webhooks.controller';
import { PresenteService } from './presente.service';
import { PresenteCredentialsService } from './presente-credentials.service';
import { PresenteCallsService } from './presente-calls.service';
import { PresenteDebtsService } from './presente-debts.service';
import { PresenteInvoicesService } from './presente-invoices.service';
import { PresenteJobsService } from './presente-jobs.service';
import { PresentePlacesService } from './presente-places.service';
import { PresentePushService } from './presente-push.service';
import { PresenteRemindersService } from './presente-reminders.service';
import { PresenteRequestsService } from './presente-requests.service';
import { PresenteWalletService } from './presente-wallet.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PresenteController, PresenteWebhooksController],
  providers: [
    PresenteService,
    PresenteRequestsService,
    PresenteJobsService,
    PresentePlacesService,
    PresentePushService,
    PresenteRemindersService,
    PresenteCredentialsService,
    PresenteDebtsService,
    PresenteInvoicesService,
    PresenteCallsService,
    PresenteMercadoPagoService,
    PresenteSafetyService,
    PresenteStorageService,
    PresenteWalletService,
    PresenteFeatureGuard,
  ],
})
export class PresenteModule {}
