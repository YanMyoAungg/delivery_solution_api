import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto.js';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto.js';
import { DeliveryPartnerResponseDto } from './dto/delivery-partner-response.dto.js';
import { DeliveryPartnersService } from './delivery-partners.service.js';

@ApiTags('Delivery partners')
@ApiBearerAuth('access-token')
@Controller({ path: 'delivery-partners', version: '1' })
export class DeliveryPartnersController {
  constructor(private readonly deliveryPartnersService: DeliveryPartnersService) {}

  @Get() @RequirePermissions('partners.read') @ApiOkResponse({ type: [DeliveryPartnerResponseDto] })
  list(): Promise<DeliveryPartnerResponseDto[]> { return this.deliveryPartnersService.list(); }

  @Post() @RequirePermissions('partners.create') @ApiCreatedResponse({ type: DeliveryPartnerResponseDto })
  create(@Body() input: CreateDeliveryPartnerDto): Promise<DeliveryPartnerResponseDto> { return this.deliveryPartnersService.create(input); }

  @Get(':id') @RequirePermissions('partners.read') @ApiOkResponse({ type: DeliveryPartnerResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<DeliveryPartnerResponseDto> { return this.deliveryPartnersService.getById(id); }

  @Patch(':id') @RequirePermissions('partners.update') @ApiOkResponse({ type: DeliveryPartnerResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateDeliveryPartnerDto): Promise<DeliveryPartnerResponseDto> { return this.deliveryPartnersService.update(id, input); }

  @Delete(':id') @RequirePermissions('partners.delete') @HttpCode(204) @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> { return this.deliveryPartnersService.remove(id); }
}
