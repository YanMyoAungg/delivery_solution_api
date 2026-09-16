import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import type { PermissionKey } from '../common/auth/permission-keys.js';
import { PermissionService } from './permissions.service.js';
import {
  CreatedPermissionDto,
  PermissionGroupDto,
} from './dto/permissions-response.dto.js';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@Controller({ path: 'permissions', version: '1' })
export class PermissionsController {
  constructor(private readonly permissions: PermissionService) {}

  @Get()
  @RequirePermissions('permissions.read')
  @ApiOperation({ summary: 'List the permission catalog grouped by domain' })
  @ApiOkResponse({ type: [PermissionGroupDto] })
  catalog(): Promise<PermissionGroupDto[]> {
    return this.permissions.getCatalog();
  }

  @Post()
  @RequirePermissions('permissions.create')
  @ApiOperation({ summary: 'Create a new permission in the catalog' })
  @ApiCreatedResponse({ type: CreatedPermissionDto })
  create(
    @Body() body: { name: string; description?: string | null },
  ): Promise<CreatedPermissionDto> {
    return this.permissions.createPermission(body);
  }

  @Delete(':name')
  @RequirePermissions('permissions.delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a permission (blocked if granted)' })
  @ApiNoContentResponse()
  remove(@Param('name') name: string): Promise<void> {
    return this.permissions.deletePermission(name);
  }

  @Get('roles/:roleId')
  @RequirePermissions('permissions.read')
  @ApiOperation({ summary: 'List the permission keys granted to a role' })
  @ApiOkResponse({ description: 'Granted permission keys' })
  grants(@Param('roleId', ParseUUIDPipe) roleId: string): Promise<string[]> {
    return this.permissions.getRoleGrants(roleId);
  }

  @Put('roles/:roleId')
  @RequirePermissions('permissions.manage')
  @ApiOperation({ summary: 'Replace the permission set granted to a role' })
  @ApiOkResponse({ description: 'The granted keys after the update' })
  replaceGrants(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: { permissions: PermissionKey[] },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<string[]> {
    return this.permissions.setRoleGrants(
      user.roleId,
      roleId,
      body.permissions ?? [],
    );
  }
}
