import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_STATUSES, type UserStatus } from '../user.schema.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Rider Updated' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'john.updated@delivery.local' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '09876543210', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Reset user password (min 8 characters)',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}
