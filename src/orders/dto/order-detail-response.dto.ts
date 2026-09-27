import { ApiProperty } from '@nestjs/swagger';
import { OrderHistoryResponseDto } from './order-history-response.dto.js';
import { OrderResponseDto } from './order-response.dto.js';

export class OrderDetailResponseDto extends OrderResponseDto {
  @ApiProperty({ type: [OrderHistoryResponseDto] })
  history: OrderHistoryResponseDto[];
}
