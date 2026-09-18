import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ORDER_STATUSES, type OrderStatus } from '../order.schema.js';

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

  @ApiPropertyOptional({ description: 'Search by exact/partial tracking code' })
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

  @ApiPropertyOptional({ description: 'Filter by customer id' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
