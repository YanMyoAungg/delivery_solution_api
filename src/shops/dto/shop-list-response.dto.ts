import { ApiProperty } from '@nestjs/swagger';
import { ShopResponseDto } from './shop-response.dto.js';

class ShopListMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  perPage: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class ShopListResponseDto {
  @ApiProperty({ type: [ShopResponseDto] })
  data: ShopResponseDto[];

  @ApiProperty({ type: ShopListMetaDto })
  meta: ShopListMetaDto;
}
