import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { SHOP_DISPLAY_STATUSES, type ShopDisplayStatus } from '../shop-display-status.util.js';

export const SHOP_DATE_BASES = ['ENTRY', 'DELIVERED'] as const;
export type ShopDateBasis = (typeof SHOP_DATE_BASES)[number];
export const SHOP_EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ShopExportFormat = (typeof SHOP_EXPORT_FORMATS)[number];

class ShopDateFilterDto {
  @ApiPropertyOptional({ example: '2026-10-16', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-16', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;

  @ApiPropertyOptional({ enum: SHOP_DATE_BASES, default: 'ENTRY' })
  @IsOptional() @IsEnum(SHOP_DATE_BASES) dateBasis: ShopDateBasis = 'ENTRY';
}

export class ShopOrdersQueryDto extends ShopDateFilterDto {
  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeFrom?: string;

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeTo?: string;

  @ApiPropertyOptional({ enum: SHOP_DISPLAY_STATUSES })
  @IsOptional() @IsEnum(SHOP_DISPLAY_STATUSES) displayStatus?: ShopDisplayStatus;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional() @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  ) @IsBoolean() needsAttention?: boolean;

  @ApiPropertyOptional({ description: 'Search customer name, phone, or tracking code' })
  @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) perPage = 50;
}

export class ShopOrdersExportQueryDto extends ShopDateFilterDto {
  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeFrom?: string;

  @ApiPropertyOptional({ pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\\d$/) timeTo?: string;

  @ApiPropertyOptional({ enum: SHOP_DISPLAY_STATUSES })
  @IsOptional() @IsEnum(SHOP_DISPLAY_STATUSES) displayStatus?: ShopDisplayStatus;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional() @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  ) @IsBoolean() needsAttention?: boolean;

  @ApiPropertyOptional({ description: 'Search customer name, phone, or tracking code' })
  @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ enum: SHOP_EXPORT_FORMATS })
  @IsEnum(SHOP_EXPORT_FORMATS) format!: ShopExportFormat;
}

export class ShopDashboardQueryDto extends ShopDateFilterDto {}

export class ShopStatementQueryDto extends ShopDateFilterDto {}

export class ShopStatementExportQueryDto extends ShopDateFilterDto {
  @ApiPropertyOptional({ enum: SHOP_EXPORT_FORMATS })
  @IsEnum(SHOP_EXPORT_FORMATS) format!: ShopExportFormat;
}
