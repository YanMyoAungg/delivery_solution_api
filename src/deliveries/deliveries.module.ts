import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { DeliveriesController } from './deliveries.controller.js';
import { OrdersDeliveriesController } from './orders-deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';
import { RiderDeliveriesController } from './rider-deliveries.controller.js';
import { RiderBoardController } from './rider-board.controller.js';
import { OfficeDashboardController } from './office-dashboard.controller.js';
import { OfficeDashboardService } from './office-dashboard.service.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [OrdersModule, PermissionsModule],
  controllers: [
    DeliveriesController,
    OrdersDeliveriesController,
    RiderDeliveriesController,
    RiderBoardController,
    OfficeDashboardController,
  ],
  providers: [DeliveriesService, OfficeDashboardService],
})
export class DeliveriesModule {}
