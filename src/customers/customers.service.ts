import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { customers } from './customer.schema.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { CustomerListResponseDto } from './dto/customer-list-response.dto.js';

function toCustomerResponse(
  row: typeof customers.$inferSelect,
): CustomerResponseDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
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
    const where = query.search?.trim()
      ? (() => {
          const search = `%${escapeLikeWildcards(query.search.trim())}%`;
          return or(
            ilike(customers.name, search),
            ilike(customers.phone, search),
            ilike(customers.address, search),
          );
        })()
      : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db.query.customers.findMany({
        where,
        limit: perPage,
        offset: (page - 1) * perPage,
        orderBy: customers.name,
      }),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map(toCustomerResponse),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getById(id: string): Promise<CustomerResponseDto> {
    return toCustomerResponse(await this.customerOrThrow(id));
  }

  async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    const [row] = await this.database.db
      .insert(customers)
      .values({
        name: dto.name.trim(),
        phone: dto.phone ?? null,
        address: dto.address ?? null,
      })
      .returning();
    return toCustomerResponse(row);
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    await this.customerOrThrow(id);
    const [row] = await this.database.db
      .update(customers)
      .set({
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();
    return toCustomerResponse(row);
  }

  async remove(id: string): Promise<void> {
    await this.customerOrThrow(id);
    await this.database.db.delete(customers).where(eq(customers.id, id));
  }

  private async customerOrThrow(
    id: string,
  ): Promise<typeof customers.$inferSelect> {
    const row = await this.database.db.query.customers.findFirst({
      where: eq(customers.id, id),
    });
    if (!row) throw new NotFoundException(`Customer '${id}' not found`);
    return row;
  }
}
