import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_STATUSES, type UserStatus } from '../../users/user.schema.js';

export class CreateRiderDto {
  @ApiProperty({ example: 'John Rider' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'john.rider@delivery.local' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '09123456789', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: USER_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;
}
