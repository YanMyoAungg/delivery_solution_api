import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PICKUP_STATUSES, type PickupStatus } from '../pickup.schema.js';

export class PickupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  scheduledAt: string;

  @ApiProperty({ enum: PICKUP_STATUSES, enumName: 'PickupStatus' })
  status: PickupStatus;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true })
  createdBy: string | null;

  @ApiProperty({ type: [String] })
  orderIds: string[];

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
