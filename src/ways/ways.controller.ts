import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CommissionRateResponseDto } from './dto/commission-rate-response.dto.js';
import { CreateWayDto } from './dto/create-way.dto.js';
import { ListWaysQueryDto } from './dto/list-ways-query.dto.js';
import { MoveWayOrdersDto } from './dto/move-way-orders.dto.js';
import { PayWayAnywayDto } from './dto/pay-way-anyway.dto.js';
import { UpdateCommissionRateDto } from './dto/update-commission-rate.dto.js';
import { WayDetailResponseDto } from './dto/way-detail-response.dto.js';
import { WayResponseDto } from './dto/way-response.dto.js';
import { WaysService } from './ways.service.js';

@ApiTags('Ways')
@ApiBearerAuth('access-token')
@Controller({ path: 'ways', version: '1' })
export class WaysController {
  constructor(private readonly waysService: WaysService) {}

  @Get()
  @RequirePermissions('ways.read')
  @ApiOperation({ summary: 'List rider ways with date and derived-state filters' })
  @ApiOkResponse({ type: [WayResponseDto] })
  list(@Query() query: ListWaysQueryDto): Promise<WayResponseDto[]> {
    return this.waysService.list(query);
  }

  @Get('settings/commission-per-way')
  @RequirePermissions('ways.read')
  @ApiOkResponse({ type: CommissionRateResponseDto })
  getCommissionRate(): Promise<CommissionRateResponseDto> {
    return this.waysService.getCommissionRate();
  }

  @Put('settings/commission-per-way')
  @RequirePermissions('ways.override_commission')
  @ApiOkResponse({ type: CommissionRateResponseDto })
  updateCommissionRate(@Body() input: UpdateCommissionRateDto): Promise<CommissionRateResponseDto> {
    return this.waysService.updateCommissionRate(input);
  }

  @Post()
  @RequirePermissions('ways.create')
  @ApiOperation({ summary: 'Close the rider’s current way today and start a new one' })
  @ApiCreatedResponse({ type: WayResponseDto })
  create(@Body() input: CreateWayDto): Promise<WayResponseDto> {
    return this.waysService.create(input);
  }

  @Get(':id')
  @RequirePermissions('ways.read')
  @ApiOkResponse({ type: WayDetailResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WayDetailResponseDto> {
    return this.waysService.getById(id);
  }

  @Post(':id/close')
  @RequirePermissions('ways.update')
  @HttpCode(200)
  @ApiOkResponse({ type: WayResponseDto })
  close(@Param('id', ParseUUIDPipe) id: string): Promise<WayResponseDto> {
    return this.waysService.close(id);
  }

  @Post(':id/move-orders')
  @RequirePermissions('ways.update')
  @HttpCode(200)
  @ApiOkResponse({ type: WayDetailResponseDto })
  moveOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: MoveWayOrdersDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<WayDetailResponseDto> {
    return this.waysService.moveOrders(id, input, currentUser.id);
  }

  @Post(':id/pay-anyway')
  @RequirePermissions('ways.override_commission')
  @HttpCode(200)
  @ApiOkResponse({ type: WayResponseDto })
  payAnyway(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PayWayAnywayDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<WayResponseDto> {
    return this.waysService.payAnyway(id, input, currentUser.id);
  }
}
