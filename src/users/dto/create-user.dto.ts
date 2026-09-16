import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_STATUSES, type UserStatus } from '../user.schema.js';

export class CreateUserDto {
  @ApiProperty({ example: 'John Rider' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'john@delivery.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '09123456789', required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID()
  roleId: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: USER_STATUSES, required: false, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;
}
