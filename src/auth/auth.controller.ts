import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { PermissionService } from '../permissions/permissions.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginResponseDto } from './dto/auth-response.dto.js';
import { MeResponseDto } from './dto/me-response.dto.js';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly permissions: PermissionService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange credentials for an access token' })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the authenticated user profile + permissions' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    const profile = await this.usersService.getById(user.id);
    const permissions = await this.permissions.getEffectivePermissions(
      user.roleId,
    );
    return { user: profile, permissions };
  }

  @Post('change-password')
  @ApiBearerAuth('access-token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change the authenticated user password' })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user.id, dto);
  }
}
