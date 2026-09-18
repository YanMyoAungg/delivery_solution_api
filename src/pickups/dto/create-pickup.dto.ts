import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';

export class CreatePickupDto {
  @ApiProperty({ example: '2026-09-18T08:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderIds: string[];

  @ApiPropertyOptional({ example: 'Morning route' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
