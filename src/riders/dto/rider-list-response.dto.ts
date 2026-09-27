import { ApiProperty } from '@nestjs/swagger';
import { RiderResponseDto } from './rider-response.dto.js';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';

export class RiderListResponseDto {
  @ApiProperty({ type: RiderResponseDto, isArray: true })
  data: RiderResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
