import { ApiProperty } from '@nestjs/swagger';
import { ShopResponseDto } from './shop-response.dto.js';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';

export class ShopListResponseDto {
  @ApiProperty({ type: ShopResponseDto, isArray: true })
  data: ShopResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
