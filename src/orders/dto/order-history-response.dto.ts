import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../order.schema.js';

export class OrderHistoryResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  orderId: string;

  @ApiPropertyOptional({
    enum: ORDER_STATUSES,
    enumName: 'OrderStatus',
    nullable: true,
  })
  fromStatus: OrderStatus | null;

  @ApiProperty({ enum: ORDER_STATUSES, enumName: 'OrderStatus' })
  toStatus: OrderStatus;

  @ApiPropertyOptional({ nullable: true })
  changedBy: string | null;

  @ApiPropertyOptional({ nullable: true })
  note: string | null;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  createdAt: string;
}
