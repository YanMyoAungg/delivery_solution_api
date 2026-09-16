import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { PermissionService } from '../permissions/permissions.service.js';
import type { JwtPayload } from '../common/auth/auth.constants.js';
import { verifyPassword, hashPassword } from '../common/utils/password.util.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginResponseDto } from './dto/auth-response.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Always run bcrypt (even on unknown email) so response timing does not
    // reveal which accounts exist. Use a fixed dummy hash as the compare target.
    let passwordValid: boolean;
    try {
      // Valid bcrypt hash of a throwaway string — a timing-safe compare target.
      passwordValid = await verifyPassword(
        dto.password,
        user?.passwordHash ??
          '$2b$10$XJ9fKZiunlSkdhNtJTcVyOqLELjhTL1u3tiAVDZnfYT9g6b8GUBUe',
      );
    } catch {
      passwordValid = false;
    }

    if (!user || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is deactivated');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ??
        '1h') as JwtSignOptions['expiresIn'],
    });

    const permissions = await this.permissions.getEffectivePermissions(
      user.roleId,
    );

    return {
      accessToken,
      user: await this.usersService.getById(user.id),
      permissions,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const account = await this.usersService.findByIdWithPassword(userId);
    if (!account) {
      throw new UnauthorizedException('User not found');
    }

    const matches = await verifyPassword(
      dto.currentPassword,
      account.passwordHash,
    );
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.usersService.setPassword(userId, passwordHash);
  }
}
