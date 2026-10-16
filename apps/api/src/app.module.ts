import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { CommerceSecurityModule } from './core/commerce-security/commerce-security.module';
import { CustomerModule } from './core/customer/customer.module';
import { EventsModule } from './core/events/events.module';
import { ExperienceModule } from './core/experience/experience.module';
import { KnowledgeModule } from './core/knowledge/knowledge.module';
import { LoyaltyModule } from './core/loyalty/loyalty.module';
import { KnowledgeAlternativeModule } from './core/knowledge/alternative/knowledge-alternative.module';
import { IncidentModule } from './core/incident/incident.module';
import { AlternativeModule } from './core/incident/alternative/alternative.module';
import { OperationsModule } from './core/operations/operations.module';
import { TaskModule } from './core/task/task.module';
import { HealthModule } from './health/health.module';
import { ClinicalModule } from './clinical/clinical.module';
import { CompanyModule } from './identity/company/company.module';
import { RoleModule } from './identity/role/role.module';
import { TeamModule } from './identity/team/team.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkflowModule } from './core/workflow/workflow.module';
import { VisitModule } from './core/visit/visit.module';
import { CatalogModule } from './core/catalog/catalog.module';
import { PromotionModule } from './core/promotion/promotion.module';
import { SiteModule } from './core/site/site.module';
import { InventoryModule } from './core/inventory/inventory.module';
import { RecipeModule } from './core/recipe/recipe.module';
import { OrderModule } from './core/order/order.module';
import { PaymentModule } from './core/payment/payment.module';
import { ReturnModule } from './core/return/return.module';
import { DiningTableModule } from './core/dining-table/dining-table.module';
import { OrderSplitModule } from './core/order-split/order-split.module';
import { OrderDiscountModule } from './core/order-discount/order-discount.module';
import { SpaceModule } from './core/space/space.module';
import { ReminderModule } from './core/reminder/reminder.module';
import { CaptureModule } from './core/capture/capture.module';
import { MediaModule } from './core/media/media.module';
import { EngagementModule } from './core/engagement/engagement.module';
import { ScratchModule } from './core/scratch/scratch.module';
import { BriefingModule } from './core/briefing/briefing.module';
import { AssistantPreferenceModule } from './core/assistant-preference/assistant-preference.module';
import { SurveyModule } from './core/survey/survey.module';
import { MobilityModule } from './mobility/mobility.module';
import { BusinessAssistantModule } from './core/business-assistant/business-assistant.module';

import { ReservationModule } from './core/reservation/reservation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    AuthModule,
    CommerceSecurityModule,
    HealthModule,
    ClinicalModule,
    CompanyModule,
    RoleModule,
    TeamModule,

    SpaceModule,
    TaskModule,
    ReminderModule,
    CaptureModule,
    MediaModule,
    EngagementModule,
    ScratchModule,
    BriefingModule,
    AssistantPreferenceModule,
    BusinessAssistantModule,
    SurveyModule,
    MobilityModule,
    OperationsModule,
    CustomerModule,
    VisitModule,
    LoyaltyModule,
    CatalogModule,
    PromotionModule,
    SiteModule,
    InventoryModule,
    RecipeModule,
    OrderModule,
    ReservationModule,
    PaymentModule,
    ReturnModule,
    DiningTableModule,
    OrderSplitModule,
    OrderDiscountModule,

    IncidentModule,
    AlternativeModule,

    KnowledgeModule,
    KnowledgeAlternativeModule,

    EventsModule,
    ExperienceModule,
    WorkflowModule,
  ],
})
export class AppModule {}

