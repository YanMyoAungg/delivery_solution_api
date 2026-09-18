import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CreatePickupDto } from './dto/create-pickup.dto.js';
import { ListPickupsQueryDto } from './dto/list-pickups-query.dto.js';
import { PickupListResponseDto } from './dto/pickup-list-response.dto.js';
import { PickupResponseDto } from './dto/pickup-response.dto.js';
import { PickupsService } from './pickups.service.js';

@ApiTags('Pickups')
@ApiBearerAuth('access-token')
@Controller({ path: 'pickups', version: '1' })
export class PickupsController {
  constructor(private readonly pickups: PickupsService) {}

  @Get()
  @RequirePermissions('pickups.read')
  @ApiOkResponse({ type: PickupListResponseDto })
  list(@Query() query: ListPickupsQueryDto): Promise<PickupListResponseDto> {
    return this.pickups.list(query);
  }

  @Post()
  @RequirePermissions('pickups.create')
  @ApiCreatedResponse({ type: PickupResponseDto })
  create(
    @Body() dto: CreatePickupDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PickupResponseDto> {
    return this.pickups.create(dto, user.id, idempotencyKey ?? '');
  }

  @Get(':id')
  @RequirePermissions('pickups.read')
  @ApiOkResponse({ type: PickupResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PickupResponseDto> {
    return this.pickups.getById(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions('pickups.update')
  @ApiOkResponse({ type: PickupResponseDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PickupResponseDto> {
    return this.pickups.complete(id, user.id);
  }

  @Post(':id/receive')
  @HttpCode(200)
  @RequirePermissions('pickups.update')
  @ApiOkResponse({ type: PickupResponseDto })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PickupResponseDto> {
    return this.pickups.receive(id, user.id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('pickups.update')
  @ApiOkResponse({ type: PickupResponseDto })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PickupResponseDto> {
    return this.pickups.cancel(id);
  }
}
