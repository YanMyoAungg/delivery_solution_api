import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { OfficeDashboardQueryDto } from './dto/office-dashboard-query.dto.js';
import { OfficeDashboardResponseDto } from './dto/office-dashboard-response.dto.js';
import { OfficeDashboardService } from './office-dashboard.service.js';

@ApiTags('Office Dashboard')
@ApiBearerAuth('access-token')
@Controller({ path: 'office/dashboard', version: '1' })
export class OfficeDashboardController {
  constructor(private readonly dashboard: OfficeDashboardService) {}

  @Get()
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get read-only office operational dashboard aggregates' })
  @ApiOkResponse({ type: OfficeDashboardResponseDto })
  getDashboard(
    @Query() query: OfficeDashboardQueryDto,
  ): Promise<OfficeDashboardResponseDto> {
    return this.dashboard.getDashboard(query.date);
  }
}
