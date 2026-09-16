import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [PermissionsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
