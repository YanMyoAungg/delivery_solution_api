import { ApiProperty } from '@nestjs/swagger';
import { CustomerResponseDto } from './customer-response.dto.js';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';

export class CustomerListResponseDto {
  @ApiProperty({ type: CustomerResponseDto, isArray: true })
  data: CustomerResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
