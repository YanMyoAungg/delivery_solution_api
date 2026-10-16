import { Module } from '@nestjs/common';
import { RidersController } from './riders.controller.js';
import { RidersService } from './riders.service.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [OrdersModule, PermissionsModule],
  controllers: [RidersController],
  providers: [RidersService],
})
export class RidersModule {}
