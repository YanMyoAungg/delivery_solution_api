import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import type { PermissionKey } from '../../common/auth/permission-keys.js';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'Permission keys to grant (replaces the set)',
    example: ['users.create', 'users.read'],
  })
  @IsArray()
  @IsString({ each: true })
  permissions: PermissionKey[];
}
