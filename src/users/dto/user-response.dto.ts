import { ApiProperty } from '@nestjs/swagger';
import { USER_STATUSES, type UserStatus } from '../user.schema.js';

export class UserResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'System Owner' })
  name: string;

  @ApiProperty({ example: 'owner@mail.com' })
  email: string;

  @ApiProperty({ example: '09123456789', nullable: true })
  phone: string | null;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  roleId: string;

  @ApiProperty({ example: 'OWNER' })
  role: string;

  @ApiProperty({
    enum: USER_STATUSES,
    enumName: 'UserStatus',
    example: 'ACTIVE',
  })
  status: UserStatus;

  @ApiProperty({ example: '2026-09-14T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-14T10:00:00.000Z' })
  updatedAt: string;
}
