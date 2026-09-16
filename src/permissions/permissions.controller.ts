import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { PermissionService } from './permissions.service.js';
import { PermissionGroupDto } from './dto/permissions-response.dto.js';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@Controller({ path: 'permissions', version: '1' })
export class PermissionsController {
  constructor(private readonly permissions: PermissionService) {}

  @Get()
  @RequirePermissions('permissions.read')
  @ApiOperation({
    summary: 'List the fixed permission catalog grouped by module',
  })
  @ApiOkResponse({ type: [PermissionGroupDto] })
  catalog(): Promise<PermissionGroupDto[]> {
    return this.permissions.getCatalog();
  }

  @Get('roles/:roleId')
  @RequirePermissions('permissions.read')
  @ApiOperation({ summary: 'List the permission keys granted to a role' })
  @ApiOkResponse({ type: [String], description: 'Granted permission keys' })
  grants(@Param('roleId', ParseUUIDPipe) roleId: string): Promise<string[]> {
    return this.permissions.getEffectivePermissions(roleId);
  }

  @Put('roles/:roleId')
  @RequirePermissions('permissions.update')
  @ApiOperation({ summary: 'Replace the permission set granted to a role' })
  @ApiOkResponse({
    type: [String],
    description: 'The granted keys after the update',
  })
  replaceGrants(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<string[]> {
    return this.permissions.setRoleGrants(
      user.roleId,
      roleId,
      body.permissions,
    );
  }
}
