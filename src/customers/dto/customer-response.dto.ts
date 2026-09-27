import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 150 })
  name!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  notes?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
