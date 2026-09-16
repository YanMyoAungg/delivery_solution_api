import { ApiProperty } from '@nestjs/swagger';

export class PermissionGroupDto {
  @ApiProperty({ example: 'users' })
  domain: string;

  @ApiProperty({ type: [String], example: ['users.list', 'users.read'] })
  permissions: string[];
}

export class CreatedPermissionDto {
  @ApiProperty({ example: 'shops.manage' })
  name: string;

  @ApiProperty({ example: 'shops' })
  domain: string;
}
