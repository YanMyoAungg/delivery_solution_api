import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_STATUSES, type UserStatus } from '../../users/user.schema.js';

export class RiderResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId: string;

  @ApiProperty({ example: 'John Rider' })
  name: string;

  @ApiProperty({ example: 'john.rider@delivery.local' })
  email: string;

  @ApiPropertyOptional({ example: '09123456789', nullable: true })
  phone: string | null;

  @ApiProperty({ enum: USER_STATUSES, enumName: 'UserStatus' })
  status: UserStatus;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  updatedAt: string;
}
