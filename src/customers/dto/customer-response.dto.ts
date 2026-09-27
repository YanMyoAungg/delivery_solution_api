import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Aung Aung' })
  name: string;

  @ApiPropertyOptional({ example: '09123456789', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'No. 1, Main Road', nullable: true })
  address: string | null;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  updatedAt: string;
}
