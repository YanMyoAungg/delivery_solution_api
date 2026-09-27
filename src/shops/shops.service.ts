import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { escapeLikeWildcards } from '../common/utils/normalize.util.js';
import { shops } from './shop.schema.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { UpdateShopDto } from './dto/update-shop.dto.js';
import { ListShopsQueryDto } from './dto/list-shops-query.dto.js';
import { ShopResponseDto } from './dto/shop-response.dto.js';
import { ShopListResponseDto } from './dto/shop-list-response.dto.js';

const SELECT_SHOP_COLUMNS = {
  id: shops.id,
  name: shops.name,
  phone: shops.phone,
  address: shops.address,
  notes: shops.notes,
  channelType: shops.channelType,
  channelName: shops.channelName,
  createdAt: shops.createdAt,
  updatedAt: shops.updatedAt,
};

type ShopRow = typeof shops.$inferSelect;

export function toShopResponse(row: Omit<ShopRow, 'chatId'>): ShopResponseDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    channelType: row.channelType,
    channelName: row.channelName,
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

    const conditions = [];
    if (query.search?.trim()) {
      const term = `%${escapeLikeWildcards(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(shops.name, term),
          ilike(shops.phone, term),
          ilike(shops.channelName, term),
        ),
      );
    }
    if (query.channelType) {
      conditions.push(eq(shops.channelType, query.channelType));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db
        .select(SELECT_SHOP_COLUMNS)
        .from(shops)
        .where(where)
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(shops)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return {
      data: rows.map(toShopResponse),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async getById(id: string): Promise<ShopResponseDto> {
    const row = await this.findRawById(id);
    return toShopResponse(row);
  }

  async create(dto: CreateShopDto): Promise<ShopResponseDto> {
    try {
      const inserted = await this.database.db
        .insert(shops)
        .values({
          name: dto.name,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
          notes: dto.notes ?? null,
          channelType: dto.channelType,
          channelName: dto.channelName,
        })
        .returning({ id: shops.id });
      return this.getById(inserted[0].id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Shop with name '${dto.name}' already exists`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateShopDto): Promise<ShopResponseDto> {
    await this.findRawById(id);
    try {
      await this.database.db
        .update(shops)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.channelType !== undefined && {
            channelType: dto.channelType,
          }),
          ...(dto.channelName !== undefined && {
            channelName: dto.channelName,
          }),
          updatedAt: new Date(),
        })
        .where(eq(shops.id, id));
      return this.getById(id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Shop with name '${dto.name as string}' already exists`,
        );
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findRawById(id);
    await this.database.db.delete(shops).where(eq(shops.id, id));
  }

  private async findRawById(id: string): Promise<Omit<ShopRow, 'chatId'>> {
    const row = await this.database.db
      .select(SELECT_SHOP_COLUMNS)
      .from(shops)
      .where(eq(shops.id, id))
      .limit(1);
    if (!row[0]) throw new NotFoundException(`Shop '${id}' not found`);
    return row[0];
  }
}
