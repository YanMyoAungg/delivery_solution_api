import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { RolesService } from './roles.service.js';
import { RoleResponseDto } from './dto/roles-response.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { CreateRoleResponseDto } from './dto/create-role-response.dto.js';
import { UpdateRoleResponseDto } from './dto/update-role-response.dto.js';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'List roles with user counts' })
  @ApiOkResponse({ type: [RoleResponseDto] })
  list(): Promise<RoleResponseDto[]> {
    return this.roles.list();
  }

  @Get(':id')
  @RequirePermissions('roles.read')
  @ApiOperation({ summary: 'Get a role by id' })
  @ApiOkResponse({ type: RoleResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponseDto> {
    return this.roles.getById(id);
  }

  @Post()
  @RequirePermissions('roles.create')
  @ApiOperation({ summary: 'Create a role' })
  @ApiCreatedResponse({ type: CreateRoleResponseDto })
  create(
    @Body() body: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; name: string; isSystem: boolean }> {
    return this.roles.create(user.roleId, body);
  }

  @Patch(':id')
  @RequirePermissions('roles.update')
  @ApiOperation({ summary: 'Edit a role description' })
  @ApiOkResponse({ type: UpdateRoleResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string }> {
    return this.roles.update(user.roleId, id, body);
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a role (blocked if assigned)' })
  @ApiNoContentResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.roles.remove(user.roleId, id);
  }
}
