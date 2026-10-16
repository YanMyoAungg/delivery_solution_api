import { Module } from '@nestjs/common';
import { WaysController } from './ways.controller.js';
import { WaysService } from './ways.service.js';

@Module({
  controllers: [WaysController],
  providers: [WaysService],
  exports: [WaysService],
})
export class WaysModule {}
