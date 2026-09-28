import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export const RIDER_BOARD_FILTERS = ['mine', 'all'] as const;
export type RiderBoardFilter = (typeof RIDER_BOARD_FILTERS)[number];

export class RiderBoardQueryDto {
  @ApiPropertyOptional({ example: '2026-09-29', description: 'Office-local calendar date; defaults to today' })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ enum: RIDER_BOARD_FILTERS, default: 'all' })
  @IsOptional()
  @IsEnum(RIDER_BOARD_FILTERS)
  filter?: RiderBoardFilter = 'all';

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 50;
}
