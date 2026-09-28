import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CreateTownshipDto } from './dto/create-township.dto.js';
import { ListTownshipsQueryDto } from './dto/list-townships-query.dto.js';
import { TownshipResponseDto } from './dto/township-response.dto.js';
import { UpdateTownshipDto } from './dto/update-township.dto.js';
import { TownshipsService } from './townships.service.js';

@ApiTags('Townships')
@ApiBearerAuth('access-token')
@Controller({ path: 'townships', version: '1' })
export class TownshipsController {
  constructor(private readonly townships: TownshipsService) {}

  @Get()
  @RequirePermissions('orders.read')
  @ApiOkResponse({ type: [TownshipResponseDto] })
  list(@Query() query: ListTownshipsQueryDto): Promise<TownshipResponseDto[]> {
    return this.townships.list(query);
  }

  @Post()
  @RequirePermissions('orders.create')
  @ApiCreatedResponse({ type: TownshipResponseDto })
  create(@Body() dto: CreateTownshipDto): Promise<TownshipResponseDto> {
    return this.townships.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('orders.update')
  @ApiOkResponse({ type: TownshipResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTownshipDto,
  ): Promise<TownshipResponseDto> {
    return this.townships.update(id, dto);
  }
}
