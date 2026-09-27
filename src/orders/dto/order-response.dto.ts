import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../order.schema.js';

export class OrderResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'ORD-01J8ZQ4C7M3W9X2K5T8R1V6B0P' })
  trackingCode: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  shopId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  customerId: string;

  @ApiPropertyOptional({
    description:
      'Opaque package metadata; shape and physical units are not yet defined',
    type: Object,
    nullable: true,
  })
  packageInfo: Record<string, unknown> | null;

  @ApiProperty({ example: '0.00', description: 'Decimal string' })
  deliveryFee: string;

  @ApiProperty({ example: '0.00', description: 'Decimal string' })
  codAmount: string;

  @ApiProperty({ enum: ORDER_STATUSES, enumName: 'OrderStatus' })
  status: OrderStatus;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  updatedAt: string;
}
