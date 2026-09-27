import { ApiProperty } from '@nestjs/swagger';
import { RiderResponseDto } from './rider-response.dto.js';

class RiderListMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  perPage: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class RiderListResponseDto {
  @ApiProperty({ type: [RiderResponseDto] })
  data: RiderResponseDto[];

  @ApiProperty({ type: RiderListMetaDto })
  meta: RiderListMetaDto;
}
