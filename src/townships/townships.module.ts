import { Module } from '@nestjs/common';
import { TownshipsController } from './townships.controller.js';
import { TownshipsService } from './townships.service.js';

@Module({
  controllers: [TownshipsController],
  providers: [TownshipsService],
  exports: [TownshipsService],
})
export class TownshipsModule {}
