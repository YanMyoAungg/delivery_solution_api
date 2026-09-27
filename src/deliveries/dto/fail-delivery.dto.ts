import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FAILURE_REASONS, type FailureReason } from '../delivery.schema.js';

export class FailDeliveryDto {
  @ApiProperty({ enum: FAILURE_REASONS, enumName: 'FailureReason' })
  @IsEnum(FAILURE_REASONS)
  reason: FailureReason;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
