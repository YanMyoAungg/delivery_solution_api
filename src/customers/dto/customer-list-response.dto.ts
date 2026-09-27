import { ApiProperty } from '@nestjs/swagger';
import { CustomerResponseDto } from './customer-response.dto.js';

class CustomerListMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  perPage: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class CustomerListResponseDto {
  @ApiProperty({ type: [CustomerResponseDto] })
  data: CustomerResponseDto[];

  @ApiProperty({ type: CustomerListMetaDto })
  meta: CustomerListMetaDto;
}
