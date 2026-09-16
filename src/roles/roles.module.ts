import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
