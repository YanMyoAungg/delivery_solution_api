import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ nullable: true })
  assignedRiderName: string | null;

  @ApiPropertyOptional()
  deliveryAttemptId?: string;

  @ApiPropertyOptional()
  attemptNumber?: number;

  @ApiProperty()
  isMine: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional({ nullable: true })
  customerId?: string;

  @ApiPropertyOptional({ nullable: true })
  customerName?: string;

  @ApiPropertyOptional({ nullable: true })
  customerPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  customerAddress?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  packageInfo?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: '0.00' })
  deliveryFee?: string;

  @ApiPropertyOptional({ example: '0.00' })
  codAmount?: string;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;
}
