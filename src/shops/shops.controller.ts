import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ShopsService } from './shops.service.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { UpdateShopDto } from './dto/update-shop.dto.js';
import { ListShopsQueryDto } from './dto/list-shops-query.dto.js';
import { ShopResponseDto } from './dto/shop-response.dto.js';
import { ShopListResponseDto } from './dto/shop-list-response.dto.js';

@ApiTags('Shops')
@ApiBearerAuth('access-token')
@Controller({ path: 'shops', version: '1' })
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  @RequirePermissions('shops.read')
  @ApiOperation({ summary: 'List shops with search and pagination' })
  @ApiOkResponse({ type: ShopListResponseDto })
  list(@Query() query: ListShopsQueryDto): Promise<ShopListResponseDto> {
    return this.shopsService.list(query);
  }

  @Post()
  @RequirePermissions('shops.create')
  @ApiOperation({ summary: 'Create a shop' })
  @ApiCreatedResponse({ type: ShopResponseDto })
  create(@Body() dto: CreateShopDto): Promise<ShopResponseDto> {
    return this.shopsService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('shops.read')
  @ApiOperation({ summary: 'Get a shop by id' })
  @ApiOkResponse({ type: ShopResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ShopResponseDto> {
    return this.shopsService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('shops.update')
  @ApiOperation({ summary: 'Update a shop' })
  @ApiOkResponse({ type: ShopResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
  ): Promise<ShopResponseDto> {
    return this.shopsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('shops.delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a shop' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.shopsService.remove(id);
  }
}
