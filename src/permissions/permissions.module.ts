import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller.js';
import { PermissionService } from './permissions.service.js';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionsModule {}
