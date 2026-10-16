import { ApiProperty } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../../orders/order.schema.js';

export class RiderBoardOrderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  trackingCode: string;

  @ApiProperty({ enum: ORDER_STATUSES, enumName: 'OrderStatus' })
  status: OrderStatus;

  @ApiProperty()
  townshipId: string;

  @ApiProperty()
  townshipName: string;

  @ApiProperty()
  shopName: string;

  @ApiProperty()
  deliveryAttemptId: string;

  @ApiProperty()
  attemptNumber: number;

  @ApiProperty({
    deprecated: true,
    description: 'Always true; retained temporarily for rider-client compatibility.',
  })
  isMine: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  customerId: string;

  @ApiProperty()
  customerName: string;

  @ApiProperty({ nullable: true })
  customerPhone: string | null;

  @ApiProperty({ nullable: true })
  customerAddress: string | null;

  @ApiProperty({ type: Object, nullable: true })
  packageInfo: Record<string, unknown> | null;

  @ApiProperty({ example: '0.00' })
  deliveryFee: string;

  @ApiProperty({ example: '0.00' })
  codAmount: string;

  @ApiProperty({ nullable: true })
  notes: string | null;
}
