import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { roles } from '../roles/roles.schema.js';
import { riders } from '../riders/rider.schema.js';
import { users } from '../users/user.schema.js';
import { CreateTownshipDto } from './dto/create-township.dto.js';
import { ListTownshipsQueryDto } from './dto/list-townships-query.dto.js';
import { TownshipResponseDto } from './dto/township-response.dto.js';
import { UpdateTownshipDto } from './dto/update-township.dto.js';
import { riderTownships, townships } from './township.schema.js';

type TownshipRow = typeof townships.$inferSelect;

function toTownshipResponse(row: TownshipRow, selectable: boolean): TownshipResponseDto {
  return {
    id: row.id,
    name: row.name,
    selectable,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TownshipsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListTownshipsQueryDto): Promise<TownshipResponseDto[]> {
    const rows = await this.database.db
      .select({
        township: townships,
        riderId: riders.id,
        riderStatus: users.status,
        riderRole: roles.name,
      })
      .from(townships)
      .leftJoin(riderTownships, eq(riderTownships.townshipId, townships.id))
      .leftJoin(riders, eq(riders.id, riderTownships.riderId))
      .leftJoin(users, eq(users.id, riders.userId))
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(query.selectable ? and(eq(users.status, 'ACTIVE'), eq(roles.name, 'RIDER')) : undefined)
      .orderBy(townships.name);

    const townshipIds = new Set<string>();
    const byId = new Map<string, TownshipRow>();
    for (const row of rows) {
      byId.set(row.township.id, row.township);
      if (
        row.riderId &&
        row.riderStatus === 'ACTIVE' &&
        row.riderRole === 'RIDER'
      ) {
        townshipIds.add(row.township.id);
      }
    }
    return [...byId.values()].map((township) =>
      toTownshipResponse(township, townshipIds.has(township.id)),
    );
  }

  async create(dto: CreateTownshipDto): Promise<TownshipResponseDto> {
    try {
      const [row] = await this.database.db
        .insert(townships)
        .values({ name: dto.name.trim() })
        .returning();
      return toTownshipResponse(row, false);
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
    if (dto.name === undefined) return toTownshipResponse(existing, await this.hasActiveRider(id));

    try {
      const [row] = await this.database.db
        .update(townships)
        .set({ name: dto.name.trim(), updatedAt: new Date() })
        .where(eq(townships.id, id))
        .returning();
      return toTownshipResponse(row, await this.hasActiveRider(id));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Township '${dto.name}' already exists`);
      }
      throw error;
    }
  }

  private async hasActiveRider(townshipId: string): Promise<boolean> {
    const [row] = await this.database.db
      .select({ riderId: riderTownships.riderId })
      .from(riderTownships)
      .innerJoin(riders, eq(riders.id, riderTownships.riderId))
      .innerJoin(users, eq(users.id, riders.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(riderTownships.townshipId, townshipId),
          eq(users.status, 'ACTIVE'),
          eq(roles.name, 'RIDER'),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
