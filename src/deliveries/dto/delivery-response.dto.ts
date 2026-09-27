import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DELIVERY_STATUSES,
  FAILURE_REASONS,
  type DeliveryStatus,
  type FailureReason,
} from '../delivery.schema.js';

export class DeliveryResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  orderId: string;
  @ApiProperty()
  riderId: string;
  @ApiProperty()
  attemptNumber: number;
  @ApiProperty({ enum: DELIVERY_STATUSES, enumName: 'DeliveryStatus' })
  status: DeliveryStatus;
  @ApiPropertyOptional({
    enum: FAILURE_REASONS,
    enumName: 'FailureReason',
    nullable: true,
  })
  failureReason: FailureReason | null;
  @ApiPropertyOptional({ nullable: true })
  failureNote: string | null;
  @ApiPropertyOptional({ nullable: true })
  assignedBy: string | null;
  @ApiProperty()
  assignedAt: string;
  @ApiPropertyOptional({ nullable: true })
  startedAt: string | null;
  @ApiPropertyOptional({ nullable: true })
  deliveredAt: string | null;
  @ApiPropertyOptional({ nullable: true })
  failedAt: string | null;
  @ApiProperty()
  createdAt: string;
  @ApiProperty()
  updatedAt: string;
}
