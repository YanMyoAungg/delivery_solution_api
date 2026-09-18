import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { shops } from './shop.schema.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { UpdateShopDto } from './dto/update-shop.dto.js';
import { ListShopsQueryDto } from './dto/list-shops-query.dto.js';
import { ShopResponseDto } from './dto/shop-response.dto.js';
import { ShopListResponseDto } from './dto/shop-list-response.dto.js';

function toShopResponse(row: typeof shops.$inferSelect): ShopResponseDto {
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
export class ShopsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListShopsQueryDto): Promise<ShopListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const where = query.search?.trim()
      ? (() => {
          const search = `%${escapeLikeWildcards(query.search.trim())}%`;
          return or(
            ilike(shops.name, search),
            ilike(shops.phone, search),
            ilike(shops.address, search),
          );
        })()
      : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db.query.shops.findMany({
        where,
        limit: perPage,
        offset: (page - 1) * perPage,
        orderBy: shops.name,
      }),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(shops)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map(toShopResponse),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getById(id: string): Promise<ShopResponseDto> {
    return toShopResponse(await this.shopOrThrow(id));
  }

  async create(dto: CreateShopDto): Promise<ShopResponseDto> {
    try {
      const [row] = await this.database.db
        .insert(shops)
        .values({
          name: dto.name.trim(),
          phone: dto.phone ?? null,
          address: dto.address ?? null,
        })
        .returning();
      return toShopResponse(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Shop '${dto.name.trim()}' already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateShopDto): Promise<ShopResponseDto> {
    await this.shopOrThrow(id);
    try {
      const [row] = await this.database.db
        .update(shops)
        .set({
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.address !== undefined && { address: dto.address }),
          updatedAt: new Date(),
        })
        .where(eq(shops.id, id))
        .returning();
      return toShopResponse(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Shop '${dto.name?.trim()}' already exists`);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.shopOrThrow(id);
    await this.database.db.delete(shops).where(eq(shops.id, id));
  }

  private async shopOrThrow(id: string): Promise<typeof shops.$inferSelect> {
    const row = await this.database.db.query.shops.findFirst({
      where: eq(shops.id, id),
    });
    if (!row) throw new NotFoundException(`Shop '${id}' not found`);
    return row;
  }
}
