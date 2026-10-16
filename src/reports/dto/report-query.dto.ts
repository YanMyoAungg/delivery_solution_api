import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { ORDER_STATUSES, type OrderStatus } from '../../orders/order.schema.js';

export const REPORT_DATE_BASES = ['ENTRY', 'DELIVERED'] as const;
export type ReportDateBasis = (typeof REPORT_DATE_BASES)[number];
export const REPORT_EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export class DateRangeQueryDto {
  @ApiProperty({ example: '2026-10-01', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom!: string;

  @ApiProperty({ example: '2026-10-31', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo!: string;

  @ApiPropertyOptional({ enum: REPORT_DATE_BASES, default: 'ENTRY' })
  @IsOptional()
  @IsEnum(REPORT_DATE_BASES)
  dateBasis: ReportDateBasis = 'ENTRY';
}

export class OrderReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() shopId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() townshipId?: string;
  @ApiPropertyOptional({ enum: ORDER_STATUSES }) @IsOptional() @IsEnum(ORDER_STATUSES) status?: OrderStatus;
  @ApiPropertyOptional({ format: 'uuid', description: 'Rider or delivery partner id' }) @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional({ description: 'Search by tracking code, customer name, or phone' }) @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) perPage = 50;
}

export class ExportFormatQueryDto extends DateRangeQueryDto {
  @ApiProperty({ enum: REPORT_EXPORT_FORMATS }) @IsEnum(REPORT_EXPORT_FORMATS) format!: ReportExportFormat;
}

export class OrderReportExportQueryDto extends ExportFormatQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() shopId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() townshipId?: string;
  @ApiPropertyOptional({ enum: ORDER_STATUSES }) @IsOptional() @IsEnum(ORDER_STATUSES) status?: OrderStatus;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional({ description: 'Search by tracking code, customer name, or phone' }) @IsOptional() @IsString() search?: string;
}

export class ShopStatementQueryDto extends DateRangeQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() shopId!: string;
}

export class ShopStatementExportQueryDto extends ExportFormatQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() shopId!: string;
}

export class RiderReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() riderId?: string;
}

export class RiderReportExportQueryDto extends ExportFormatQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() riderId?: string;
}
