import { ApiProperty } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../../orders/order.schema.js';

export class RiderDeliveredResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ORDER_STATUSES, enumName: 'OrderStatus' }) status: OrderStatus;
  @ApiProperty() deliveredAt: string;
}
