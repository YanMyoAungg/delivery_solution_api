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
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { CustomerListResponseDto } from './dto/customer-list-response.dto.js';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('customers.read')
  @ApiOperation({ summary: 'List customers with search and pagination' })
  @ApiOkResponse({ type: CustomerListResponseDto })
  list(
    @Query() query: ListCustomersQueryDto,
  ): Promise<CustomerListResponseDto> {
    return this.customersService.list(query);
  }

  @Post()
  @RequirePermissions('customers.create')
  @ApiOperation({ summary: 'Create a customer' })
  @ApiCreatedResponse({ type: CustomerResponseDto })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.customersService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('customers.read')
  @ApiOperation({ summary: 'Get a customer by id' })
  @ApiOkResponse({ type: CustomerResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customersService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('customers.update')
  @ApiOperation({ summary: 'Update a customer' })
  @ApiOkResponse({ type: CustomerResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('customers.delete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a customer' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customersService.remove(id);
  }
}
