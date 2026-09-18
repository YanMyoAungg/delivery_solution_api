import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { DeliveriesController } from './deliveries.controller.js';
import { OrdersDeliveriesController } from './orders-deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';
import { RiderDeliveriesController } from './rider-deliveries.controller.js';

@Module({
  imports: [OrdersModule],
  controllers: [
    DeliveriesController,
    OrdersDeliveriesController,
    RiderDeliveriesController,
  ],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
