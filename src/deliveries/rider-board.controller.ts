import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { RiderBoardQueryDto } from './dto/rider-board-query.dto.js';
import { RiderBoardResponseDto } from './dto/rider-board-response.dto.js';
import { RiderDashboardQueryDto } from './dto/rider-dashboard-query.dto.js';
import { RiderDashboardResponseDto } from './dto/rider-dashboard-response.dto.js';
import { DeliveriesService } from './deliveries.service.js';

@ApiTags('Rider Board')
@ApiBearerAuth('access-token')
@Controller({ path: 'rider', version: '1' })
export class RiderBoardController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('board')
  @RequirePermissions('deliveries.read')
  @ApiOkResponse({ type: RiderBoardResponseDto })
  board(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RiderBoardQueryDto,
  ): Promise<RiderBoardResponseDto> {
    return this.deliveries.riderBoard(user.id, query);
  }

  @Get('dashboard')
  @RequirePermissions('deliveries.read')
  @ApiOkResponse({ type: RiderDashboardResponseDto })
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RiderDashboardQueryDto,
  ): Promise<RiderDashboardResponseDto> {
    return this.deliveries.riderDashboard(user.id, query.date);
  }
}
