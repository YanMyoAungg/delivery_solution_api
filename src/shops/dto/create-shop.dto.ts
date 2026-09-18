import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateShopDto {
  @ApiProperty({ example: 'Yangon Central Shop' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: '09123456789', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'No. 1, Main Road', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
}
