import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DELIVERY_HISTORY_EVENTS,
  type DeliveryHistoryEvent,
} from '../delivery.schema.js';

export class DeliveryHistoryResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  deliveryAttemptId: string;
  @ApiProperty({
    enum: DELIVERY_HISTORY_EVENTS,
    enumName: 'DeliveryHistoryEvent',
  })
  event: DeliveryHistoryEvent;
  @ApiPropertyOptional({ nullable: true })
  actorId: string | null;
  @ApiPropertyOptional({ nullable: true })
  previousRiderId: string | null;
  @ApiPropertyOptional({ nullable: true })
  newRiderId: string | null;
  @ApiPropertyOptional({ nullable: true })
  note: string | null;
  @ApiProperty()
  createdAt: string;
}
