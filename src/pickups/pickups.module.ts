import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PickupsController } from './pickups.controller.js';
import { PickupsService } from './pickups.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [PickupsController],
  providers: [PickupsService],
})
export class PickupsModule {}
