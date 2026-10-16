import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { CreateTownshipDto } from './dto/create-township.dto.js';
import { TownshipResponseDto } from './dto/township-response.dto.js';
import { UpdateTownshipDto } from './dto/update-township.dto.js';
import { townships } from './township.schema.js';

type TownshipRow = typeof townships.$inferSelect;

function toTownshipResponse(row: TownshipRow): TownshipResponseDto {
  return {
    id: row.id,
    name: row.name,
    defaultDeliveryFee: row.defaultDeliveryFee,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TownshipsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<TownshipResponseDto[]> {
    const rows = await this.database.db
      .select()
      .from(townships)
      .orderBy(asc(townships.name));
    return rows.map(toTownshipResponse);
  }

  async create(dto: CreateTownshipDto): Promise<TownshipResponseDto> {
    try {
      const [row] = await this.database.db
        .insert(townships)
        .values({
          name: dto.name.trim(),
          defaultDeliveryFee: dto.defaultDeliveryFee,
        })
        .returning();
      return toTownshipResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Township '${dto.name}' already exists`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTownshipDto): Promise<TownshipResponseDto> {
    const existing = await this.database.db.query.townships.findFirst({
      where: eq(townships.id, id),
    });
    if (!existing) throw new NotFoundException(`Township '${id}' not found`);
    if (dto.name === undefined && dto.defaultDeliveryFee === undefined) {
      return toTownshipResponse(existing);
    }

    try {
      const [row] = await this.database.db
        .update(townships)
        .set({
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.defaultDeliveryFee !== undefined && {
            defaultDeliveryFee: dto.defaultDeliveryFee,
          }),
          updatedAt: new Date(),
        })
        .where(eq(townships.id, id))
        .returning();
      return toTownshipResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Township '${dto.name}' already exists`);
      }
      throw error;
    }
  }

}
