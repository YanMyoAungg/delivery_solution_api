import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import { OrderDetailResponseDto } from './dto/order-detail-response.dto.js';
import { OrderHistoryResponseDto } from './dto/order-history-response.dto.js';
import { OrderListResponseDto } from './dto/order-list-response.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'List orders with filters and pagination' })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(@Query() query: ListOrdersQueryDto): Promise<OrderListResponseDto> {
    return this.ordersService.list(query);
  }

  @Post()
  @RequirePermissions('orders.create')
  @ApiOperation({ summary: 'Register an order as PENDING' })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<OrderResponseDto> {
    return this.ordersService.create(dto, currentUser.id);
  }

  @Get(':id/history')
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'Get an order status history' })
  @ApiOkResponse({ type: [OrderHistoryResponseDto] })
  history(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderHistoryResponseDto[]> {
    return this.ordersService.getHistory(id);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'Get an order by id with its history' })
  @ApiOkResponse({ type: OrderDetailResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDetailResponseDto> {
    return this.ordersService.getById(id);
  }
}
