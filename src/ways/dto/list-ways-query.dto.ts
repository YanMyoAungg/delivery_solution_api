import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { WAY_STATES, type WayState } from './way-state.js';

export class ListWaysQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  riderId?: string;

  @ApiPropertyOptional({ example: '2026-10-01', format: 'date' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31', format: 'date' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: WAY_STATES })
  @IsOptional()
  @IsEnum(WAY_STATES)
  state?: WayState;
}
