import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ArrayUnique,
  IsUUID,
} from 'class-validator';
import { USER_STATUSES, type UserStatus } from '../../users/user.schema.js';
import {
  RIDER_VEHICLE_TYPES,
  type RiderVehicleType,
} from '../rider.schema.js';

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

  @ApiPropertyOptional({
    enum: RIDER_VEHICLE_TYPES,
    enumName: 'RiderVehicleType',
    default: 'BIKE',
  })
  @IsOptional()
  @IsEnum(RIDER_VEHICLE_TYPES)
  vehicleType?: RiderVehicleType;

  @ApiPropertyOptional({ example: 'MDY-1234', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehiclePlate?: string | null;

  @ApiPropertyOptional({ example: 'DL-2024-99812', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNo?: string | null;

  @ApiPropertyOptional({ example: '09987654321', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nrcNumber?: string | null;

  @ApiPropertyOptional({ example: '09111111111', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional({ example: 'Prefers north townships', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Townships this rider serves' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  townshipIds?: string[];
}
