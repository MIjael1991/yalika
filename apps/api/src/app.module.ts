import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
import { CompanyModule } from './identity/company/company.module';
import { RoleModule } from './identity/role/role.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    HealthModule,

    CompanyModule,
    RoleModule,

    TaskModule,
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

    IncidentModule,
  ],
})
export class AppModule {}
