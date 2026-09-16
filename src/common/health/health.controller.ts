import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { HealthResponseDto, HealthService } from './health.service.js';

@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(200)
  @ApiOkResponse({ type: HealthResponseDto })
  async check(): Promise<HealthResponseDto> {
    return this.healthService.getHealth();
  }
}
