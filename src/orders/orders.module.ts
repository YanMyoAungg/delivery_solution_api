import { Module } from '@nestjs/common';
import { OrderStateService } from './order-state.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateService],
  exports: [OrderStateService],
})
export class OrdersModule {}
