import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { RolesModule } from './roles/roles.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { HealthModule } from './common/health/health.module.js';
import { JwtAuthGuard } from './common/auth/auth.guard.js';
import { PermissionsGuard } from './common/auth/permissions.guard.js';
import { envValidation } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: envValidation,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PermissionsModule,
    RolesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
