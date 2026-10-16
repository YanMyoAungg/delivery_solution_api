import { ApiProperty } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../../orders/order.schema.js';

export class WayOrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() trackingCode!: string;
  @ApiProperty({ enum: ORDER_STATUSES }) status!: OrderStatus;
  @ApiProperty({ format: 'uuid', nullable: true }) wayId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) riderId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) partnerId!: string | null;
  @ApiProperty({ example: '47000.00' }) packagePrice!: string;
  @ApiProperty({ example: '3500.00' }) deliveryFee!: string;
  @ApiProperty({ example: '0.00' }) partnerFee!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) deliveredAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
