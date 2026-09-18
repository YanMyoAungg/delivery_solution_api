import { ApiProperty } from '@nestjs/swagger';
import { DeliveryHistoryResponseDto } from './delivery-history-response.dto.js';
import { DeliveryResponseDto } from './delivery-response.dto.js';

export class DeliveryDetailResponseDto extends DeliveryResponseDto {
  @ApiProperty({ type: [DeliveryHistoryResponseDto] })
  history: DeliveryHistoryResponseDto[];
}
