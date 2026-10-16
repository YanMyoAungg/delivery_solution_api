import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { OrderStateService } from './order-state.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { WaysModule } from '../ways/ways.module.js';

@Module({
  imports: [PermissionsModule, WaysModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateService],
  exports: [OrderStateService, OrdersService],
})
export class OrdersModule {}
