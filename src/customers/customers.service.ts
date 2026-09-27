import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { customers } from './customer.schema.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { CustomerListResponseDto } from './dto/customer-list-response.dto.js';

const SELECT_CUSTOMER_COLUMNS = {
  id: customers.id,
  name: customers.name,
  phone: customers.phone,
  address: customers.address,
  notes: customers.notes,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
};

type CustomerRow = typeof customers.$inferSelect;

export function toCustomerResponse(row: CustomerRow): CustomerResponseDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CustomersService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListCustomersQueryDto): Promise<CustomerListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;

    const conditions = [];
    if (query.search?.trim()) {
      const term = `%${escapeLikeWildcards(query.search.trim())}%`;
      conditions.push(
        or(ilike(customers.name, term), ilike(customers.phone, term)),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db
        .select(SELECT_CUSTOMER_COLUMNS)
        .from(customers)
        .where(where)
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map(toCustomerResponse),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async getById(id: string): Promise<CustomerResponseDto> {
    const row = await this.findRawById(id);
    return toCustomerResponse(row);
  }

  async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    const inserted = await this.database.db
      .insert(customers)
      .values({
        name: dto.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
      })
      .returning({ id: customers.id });
    return this.getById(inserted[0].id);
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    await this.findRawById(id);
    await this.database.db
      .update(customers)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id));
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.findRawById(id);
    await this.database.db.delete(customers).where(eq(customers.id, id));
  }

  private async findRawById(id: string): Promise<CustomerRow> {
    const row = await this.database.db
      .select(SELECT_CUSTOMER_COLUMNS)
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    if (!row[0]) throw new NotFoundException(`Customer '${id}' not found`);
    return row[0];
  }
}
