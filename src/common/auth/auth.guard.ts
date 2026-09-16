import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  type Type,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { users } from '../../users/user.schema.js';
import { DatabaseService } from '../database/database.service.js';
import { IS_PUBLIC_KEY, type JwtPayload } from './auth.constants.js';

@Injectable()
class RawJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(RawJwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    const header = request.headers.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedException('Missing token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const row = await this.database.db.query.users.findFirst({
      where: eq(users.id, payload.sub),
      columns: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        passwordChangedAt: true,
      },
      with: {
        role: { columns: { name: true } },
      },
    });

    if (!row || row.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or deactivated');
    }

    if (
      row.passwordChangedAt &&
      payload.iat !== undefined &&
      row.passwordChangedAt.getTime() / 1000 > payload.iat
    ) {
      throw new UnauthorizedException('Token invalidated by password change');
    }

    request.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      roleId: row.roleId,
      role: row.role.name,
    };

    return true;
  }
}

export const JwtAuthGuard: Type<CanActivate> = RawJwtAuthGuard;
