import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ORDER_STATUSES, type OrderStatus } from '../order.schema.js';

export const ORDER_DATE_BASES = ['ENTRY', 'DELIVERED'] as const;
export type OrderDateBasis = (typeof ORDER_DATE_BASES)[number];

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;

  @ApiPropertyOptional({ description: 'Search by tracking code, customer name, phone, or delivery address' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(ORDER_STATUSES)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Filter by shop id' })
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @ApiPropertyOptional({ description: 'Filter by township id' })
  @IsOptional()
  @IsUUID()
  townshipId?: string;

  @ApiPropertyOptional({ description: 'Filter by rider or partner id' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ORDER_DATE_BASES, default: 'ENTRY' })
  @IsOptional()
  @IsEnum(ORDER_DATE_BASES)
  dateBasis?: OrderDateBasis = 'ENTRY';

  @ApiPropertyOptional({ description: 'Filter by customer id' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
