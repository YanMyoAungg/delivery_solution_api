import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ReportsService } from './reports.service.js';
import { RiderDashboardResponseDto } from './dto/report-response.dto.js';

@ApiTags('Riders')
@ApiBearerAuth('access-token')
@Controller({ path: 'riders/me', version: '1' })
export class RiderDashboardController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('deliveries.read')
  @ApiOperation({ summary: 'Get the authenticated rider’s own dashboard' })
  @ApiOkResponse({ type: RiderDashboardResponseDto })
  getDashboard(@CurrentUser() user: AuthenticatedUser): Promise<RiderDashboardResponseDto> {
    return this.reports.getRiderDashboard(user.id);
  }
}
