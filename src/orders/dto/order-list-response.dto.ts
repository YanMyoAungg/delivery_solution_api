import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from './order-response.dto.js';

class OrderListMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  perPage: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  data: OrderResponseDto[];

  @ApiProperty({ type: OrderListMetaDto })
  meta: OrderListMetaDto;
}
