import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.constants.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { DeliveryListResponseDto } from './dto/delivery-list-response.dto.js';
import { DeliveriesService } from './deliveries.service.js';

@ApiTags('Rider Deliveries')
@ApiBearerAuth('access-token')
@Controller({ path: 'riders/me/deliveries', version: '1' })
export class RiderDeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequirePermissions('deliveries.read')
  @ApiOkResponse({ type: DeliveryListResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryListResponseDto> {
    return this.deliveries.listForRider(user.id);
  }
}
