import { ApiProperty } from '@nestjs/swagger';

export class PermissionGroupDto {
  @ApiProperty({ example: 'users' })
  module: string;

  @ApiProperty({ type: [String], example: ['users.create', 'users.read'] })
  permissions: string[];
}
