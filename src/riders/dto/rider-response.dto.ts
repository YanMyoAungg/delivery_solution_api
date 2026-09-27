import { ApiProperty } from '@nestjs/swagger';
import { RIDER_VEHICLE_TYPES, type RiderVehicleType } from '../rider.schema.js';
import type { UserStatus } from '../../users/user.schema.js';

/** User half of a rider, never exposing passwordHash. */
export class RiderUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 100 })
  name!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ nullable: true, maxLength: 50 })
  phone!: string | null;

  @ApiProperty({ example: 'ACTIVE', description: 'UserStatus enum value' })
  status!: UserStatus;
}

export class RiderResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Rider id (same as the user id)',
  })
  userId!: string;

  @ApiProperty({ nullable: true, maxLength: 100 })
  licenseNo!: string | null;

  @ApiProperty({
    enum: RIDER_VEHICLE_TYPES,
    enumName: 'RiderVehicleType',
    default: 'BIKE',
  })
  vehicleType!: RiderVehicleType;

  @ApiProperty({ nullable: true, maxLength: 50 })
  vehiclePlate!: string | null;

  @ApiProperty({ nullable: true, maxLength: 100 })
  nrcNumber!: string | null;

  @ApiProperty({ nullable: true, maxLength: 50 })
  emergencyContactPhone!: string | null;

  @ApiProperty()
  isAvailable!: boolean;

  @ApiProperty({ nullable: true, maxLength: 500 })
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: RiderUserDto })
  user!: RiderUserDto;
}
