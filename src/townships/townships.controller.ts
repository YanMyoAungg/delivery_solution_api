import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CreateTownshipDto } from './dto/create-township.dto.js';
import { UpdateTownshipDto } from './dto/update-township.dto.js';
import { TownshipResponseDto } from './dto/township-response.dto.js';
import { TownshipsService } from './townships.service.js';

@ApiTags('Townships')
@ApiBearerAuth('access-token')
@Controller({ path: 'townships', version: '1' })
export class TownshipsController {
  constructor(private readonly townshipsService: TownshipsService) {}

  @Get() @RequirePermissions('townships.read') @ApiOkResponse({ type: [TownshipResponseDto] })
  list(): Promise<TownshipResponseDto[]> { return this.townshipsService.list(); }

  @Post() @RequirePermissions('townships.create') @ApiCreatedResponse({ type: TownshipResponseDto })
  create(@Body() input: CreateTownshipDto): Promise<TownshipResponseDto> { return this.townshipsService.create(input); }

  @Get(':id') @RequirePermissions('townships.read') @ApiOkResponse({ type: TownshipResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TownshipResponseDto> { return this.townshipsService.getById(id); }

  @Patch(':id') @RequirePermissions('townships.update') @ApiOkResponse({ type: TownshipResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateTownshipDto): Promise<TownshipResponseDto> { return this.townshipsService.update(id, input); }

  @Delete(':id') @RequirePermissions('townships.delete') @HttpCode(204) @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> { return this.townshipsService.remove(id); }
}
