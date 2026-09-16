import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto.js';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  perPage: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class UserListResponseDto {
  @ApiProperty({ type: UserResponseDto, isArray: true })
  data: UserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}