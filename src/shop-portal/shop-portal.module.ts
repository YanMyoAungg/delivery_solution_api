import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { ShopPortalController } from './shop-portal.controller.js';
import { ShopPortalService } from './shop-portal.service.js';

@Module({
  imports: [PermissionsModule, ReportsModule],
  controllers: [ShopPortalController],
  providers: [ShopPortalService],
})
export class ShopPortalModule {}
