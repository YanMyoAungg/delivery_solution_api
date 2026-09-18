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
import { CreateRiderDto } from './dto/create-rider.dto.js';
import { ListRidersQueryDto } from './dto/list-riders-query.dto.js';
import { RiderListResponseDto } from './dto/rider-list-response.dto.js';
import { RiderResponseDto } from './dto/rider-response.dto.js';
import { UpdateRiderDto } from './dto/update-rider.dto.js';
import { RidersService } from './riders.service.js';

@ApiTags('Riders')
@ApiBearerAuth('access-token')
@Controller({ path: 'riders', version: '1' })
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  @Get()
  @RequirePermissions('riders.read')
  @ApiOperation({ summary: 'List riders with search, filters and pagination' })
  @ApiOkResponse({ type: RiderListResponseDto })
  list(@Query() query: ListRidersQueryDto): Promise<RiderListResponseDto> {
    return this.ridersService.list(query);
  }

  @Post()
  @RequirePermissions('riders.create')
  @ApiOperation({ summary: 'Create a rider and its login account' })
  @ApiCreatedResponse({ type: RiderResponseDto })
  create(@Body() dto: CreateRiderDto): Promise<RiderResponseDto> {
    return this.ridersService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('riders.read')
  @ApiOperation({ summary: 'Get a rider by id' })
  @ApiOkResponse({ type: RiderResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RiderResponseDto> {
    return this.ridersService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('riders.update')
  @ApiOperation({ summary: 'Update a rider and its login account' })
  @ApiOkResponse({ type: RiderResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRiderDto,
  ): Promise<RiderResponseDto> {
    return this.ridersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('riders.delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a rider and its login account' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.ridersService.remove(id);
  }
}
