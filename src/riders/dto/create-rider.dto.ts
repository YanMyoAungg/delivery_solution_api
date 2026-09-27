import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RIDER_VEHICLE_TYPES, type RiderVehicleType } from '../rider.schema.js';
import { USER_STATUSES, type UserStatus } from '../../users/user.schema.js';

export class CreateRiderDto {
  // ── User fields ──────────────────────────────────────────────────

  @ApiProperty({ description: 'Rider full name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ format: 'email', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    enum: USER_STATUSES,
    default: 'ACTIVE',
    description: 'User status of the backing user row',
  })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  // ── Rider profile fields ─────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Driving license number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNo?: string;

  @ApiPropertyOptional({
    enum: RIDER_VEHICLE_TYPES,
    default: 'BIKE',
  })
  @IsOptional()
  @IsEnum(RIDER_VEHICLE_TYPES)
  vehicleType?: RiderVehicleType;

  @ApiPropertyOptional({ description: 'Vehicle plate number', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehiclePlate?: string;

  @ApiPropertyOptional({
    description: 'National Registration Card number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nrcNumber?: string;

  @ApiPropertyOptional({
    description: 'Emergency contact phone number',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether the rider is currently available for deliveries',
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
