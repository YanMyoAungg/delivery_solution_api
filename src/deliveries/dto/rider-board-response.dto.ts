import { ApiProperty } from '@nestjs/swagger';
import { RiderBoardOrderDto } from './rider-board-order.dto.js';

class RiderBoardMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  perPage: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class RiderBoardResponseDto {
  @ApiProperty({ example: '2026-09-29' })
  date: string;

  @ApiProperty({ enum: ['mine', 'all'] })
  filter: 'mine' | 'all';

  @ApiProperty({ type: [RiderBoardOrderDto] })
  data: RiderBoardOrderDto[];

  @ApiProperty({ type: RiderBoardMetaDto })
  meta: RiderBoardMetaDto;
}
