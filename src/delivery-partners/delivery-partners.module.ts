import { Module } from '@nestjs/common';
import { DeliveryPartnersController } from './delivery-partners.controller.js';
import { DeliveryPartnersService } from './delivery-partners.service.js';

@Module({ controllers: [DeliveryPartnersController], providers: [DeliveryPartnersService] })
export class DeliveryPartnersModule {}
