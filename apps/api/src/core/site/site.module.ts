import { Module } from '@nestjs/common';

import { SiteController } from './site.controller';
import { SiteService } from './site.service';
import { SiteTeamController } from './site-team.controller';
import { SiteTeamService } from './site-team.service';

@Module({
  controllers: [SiteController, SiteTeamController],
  providers: [SiteService, SiteTeamService],
  exports: [SiteService, SiteTeamService],
})
export class SiteModule {}
