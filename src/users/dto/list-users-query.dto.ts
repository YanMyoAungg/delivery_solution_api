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
import { USER_STATUSES, type UserStatus } from '../user.schema.js';

export class ListUsersQueryDto {
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

  @ApiPropertyOptional({ description: 'Search by name, email or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by role id' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;
}
