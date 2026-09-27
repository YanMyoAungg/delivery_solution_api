import {
  BadRequestException,
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
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { RidersService } from './riders.service.js';
import { CreateRiderDto } from './dto/create-rider.dto.js';
import { UpdateRiderDto } from './dto/update-rider.dto.js';
import { ListRidersQueryDto } from './dto/list-riders-query.dto.js';
import { RiderResponseDto } from './dto/rider-response.dto.js';
import { RiderListResponseDto } from './dto/rider-list-response.dto.js';

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
  @ApiOperation({
    summary:
      'Create a rider — creates a RIDER-role user row and the rider profile in one transaction',
  })
  @ApiCreatedResponse({ type: RiderResponseDto })
  create(@Body() dto: CreateRiderDto): Promise<RiderResponseDto> {
    return this.ridersService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('riders.read')
  @ApiOperation({ summary: 'Get a rider by id (id = the backing user id)' })
  @ApiOkResponse({ type: RiderResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RiderResponseDto> {
    return this.ridersService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('riders.update')
  @ApiOperation({
    summary:
      'Update rider profile and/or whitelisted user fields (name, phone, status)',
  })
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
  @ApiOperation({ summary: 'Delete a rider and its backing user row' })
  @ApiNoContentResponse()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: { id: string },
  ): Promise<void> {
    if (id === currentUser.id) {
      throw new BadRequestException('You cannot delete your own rider account');
    }
    await this.ridersService.remove(id);
  }
}
