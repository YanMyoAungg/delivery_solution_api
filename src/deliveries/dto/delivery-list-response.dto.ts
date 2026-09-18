import { ApiProperty } from '@nestjs/swagger';
import { DeliveryResponseDto } from './delivery-response.dto.js';

export class DeliveryListResponseDto {
  @ApiProperty({ type: [DeliveryResponseDto] })
  data: DeliveryResponseDto[];
}
