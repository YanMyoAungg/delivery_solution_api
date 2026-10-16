import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { RiderDashboardController } from './rider-dashboard.controller.js';
import { ReportsService, ShopStatementService } from './reports.service.js';

@Module({
  controllers: [ReportsController, RiderDashboardController],
  providers: [ReportsService, ShopStatementService],
  exports: [ShopStatementService],
})
export class ReportsModule {}
