import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { DeliveryDetailResponseDto } from './dto/delivery-detail-response.dto.js';
import { DeliveryListResponseDto } from './dto/delivery-list-response.dto.js';
import { RetryDeliveryDto } from './dto/retry-delivery.dto.js';
import { DeliveriesService } from './deliveries.service.js';

@ApiTags('Order Deliveries')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders', version: '1' })
export class OrdersDeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get(':orderId/deliveries')
  @RequirePermissions('deliveries.read')
  @ApiOkResponse({ type: DeliveryListResponseDto })
  list(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<DeliveryListResponseDto> {
    return this.deliveries.listForOrder(orderId);
  }

  @Post(':orderId/deliveries/retry')
  @RequirePermissions('deliveries.create')
  @ApiCreatedResponse({ type: DeliveryDetailResponseDto })
  retry(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RetryDeliveryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryDetailResponseDto> {
    return this.deliveries.retry(orderId, dto, user.id);
  }
}
