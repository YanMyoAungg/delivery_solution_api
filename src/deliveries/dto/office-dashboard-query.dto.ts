import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

export class OfficeDashboardQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-03',
    description: 'Office-local calendar date; defaults to today',
  })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
