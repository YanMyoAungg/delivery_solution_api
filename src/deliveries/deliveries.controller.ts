import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { AssignDeliveryDto } from './dto/assign-delivery.dto.js';
import { DeliveryDetailResponseDto } from './dto/delivery-detail-response.dto.js';
import { FailDeliveryDto } from './dto/fail-delivery.dto.js';
import { DeliveriesService } from './deliveries.service.js';

@ApiTags('Deliveries')
@ApiBearerAuth('access-token')
@Controller({ path: 'deliveries', version: '1' })
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post(':orderId/assign')
  @RequirePermissions('deliveries.create')
  @ApiCreatedResponse({ type: DeliveryDetailResponseDto })
  assign(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AssignDeliveryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.assign(orderId, dto, user.id);
  }

  @Patch(':id/reassign')
  @HttpCode(200)
  @RequirePermissions('deliveries.update')
  @ApiOkResponse({ type: DeliveryDetailResponseDto })
  reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDeliveryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.reassign(id, dto, user.id);
  }

  @Get(':id')
  @RequirePermissions('deliveries.read')
  @ApiOkResponse({ type: DeliveryDetailResponseDto })
  get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.getById(id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @RequirePermissions('deliveries.update')
  @ApiOkResponse({ type: DeliveryDetailResponseDto })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.start(id, user.id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions('deliveries.update')
  @ApiOkResponse({ type: DeliveryDetailResponseDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.complete(id, user.id);
  }

  @Post(':id/fail')
  @HttpCode(200)
  @RequirePermissions('deliveries.update')
  @ApiOkResponse({ type: DeliveryDetailResponseDto })
  fail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailDeliveryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.fail(id, dto, user.id);
  }
}
