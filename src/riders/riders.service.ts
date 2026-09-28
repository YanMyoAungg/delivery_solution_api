import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { escapeLikeWildcards, normalizeEmail } from '../common/utils/normalize.util.js';
import { hashPassword } from '../common/utils/password.util.js';
import { roles } from '../roles/roles.schema.js';
import { users } from '../users/user.schema.js';
import { riderTownships, townships, townshipRotation } from '../townships/township.schema.js';
import { CreateRiderDto } from './dto/create-rider.dto.js';
import { ListRidersQueryDto } from './dto/list-riders-query.dto.js';
import { RiderListResponseDto } from './dto/rider-list-response.dto.js';
import { RiderResponseDto } from './dto/rider-response.dto.js';
import { UpdateRiderDto } from './dto/update-rider.dto.js';
import { riders, type RiderVehicleType } from './rider.schema.js';

type RiderJoinedRow = {
  riderId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  vehicleType: RiderVehicleType;
  vehiclePlate: string | null;
  licenseNo: string | null;
  nrcNumber: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RiderTransaction = Pick<
  typeof DatabaseService.prototype.db,
  'select' | 'insert' | 'delete' | 'update'
>;

function toRiderResponse(
  row: RiderJoinedRow,
  townshipIds: string[],
): RiderResponseDto {
  return {
    id: row.riderId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    vehicleType: row.vehicleType,
    vehiclePlate: row.vehiclePlate,
    licenseNo: row.licenseNo,
    nrcNumber: row.nrcNumber,
    emergencyContactPhone: row.emergencyContactPhone,
    notes: row.notes,
    townshipIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class RidersService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListRidersQueryDto): Promise<RiderListResponseDto> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const conditions = [];

    if (query.search?.trim()) {
      const search = `%${escapeLikeWildcards(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(users.name, search),
          ilike(users.email, search),
          ilike(users.phone, search),
        ),
      );
    }
    if (query.status) conditions.push(eq(users.status, query.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.database.db
        .select({
          riderId: riders.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          status: users.status,
          vehicleType: riders.vehicleType,
          vehiclePlate: riders.vehiclePlate,
          licenseNo: riders.licenseNo,
          nrcNumber: riders.nrcNumber,
          emergencyContactPhone: riders.emergencyContactPhone,
          notes: riders.notes,
          createdAt: riders.createdAt,
          updatedAt: riders.updatedAt,
        })
        .from(riders)
        .innerJoin(users, eq(riders.userId, users.id))
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(where ? and(where, eq(roles.name, 'RIDER')) : eq(roles.name, 'RIDER'))
        .orderBy(users.name)
        .limit(perPage)
        .offset((page - 1) * perPage),
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(riders)
        .innerJoin(users, eq(riders.userId, users.id))
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(where ? and(where, eq(roles.name, 'RIDER')) : eq(roles.name, 'RIDER')),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const townshipIds = await this.townshipIdsForRiders(
      rows.map((row) => row.riderId),
    );
    return {
      data: rows.map((row) =>
        toRiderResponse(row, townshipIds.get(row.riderId) ?? []),
      ),
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async getById(id: string): Promise<RiderResponseDto> {
    const row = await this.riderOrThrow(id);
    return toRiderResponse(row, await this.townshipIdsForRider(id));
  }

  async create(dto: CreateRiderDto): Promise<RiderResponseDto> {
    const role = await this.database.db.query.roles.findFirst({
      where: eq(roles.name, 'RIDER'),
      columns: { id: true },
    });
    if (!role) throw new NotFoundException("Role 'RIDER' not found");

    try {
      const riderId = await this.database.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            name: dto.name.trim(),
            email: normalizeEmail(dto.email),
            phone: dto.phone ?? null,
            passwordHash: await hashPassword(dto.password),
            passwordChangedAt: new Date(),
            roleId: role.id,
            status: dto.status ?? 'ACTIVE',
          })
          .returning({ id: users.id });
        const [rider] = await tx
          .insert(riders)
          .values({
            userId: user.id,
            vehicleType: dto.vehicleType ?? 'BIKE',
            vehiclePlate: dto.vehiclePlate ?? null,
            licenseNo: dto.licenseNo ?? null,
            nrcNumber: dto.nrcNumber ?? null,
            emergencyContactPhone: dto.emergencyContactPhone ?? null,
            notes: dto.notes ?? null,
          })
          .returning({ id: riders.id });
        const townshipIds = this.uniqueTownshipIds(dto.townshipIds ?? []);
        await this.validateTownships(tx, townshipIds);
        await this.lockTownshipRotations(tx, townshipIds);
        if (townshipIds.length > 0) {
          await tx.insert(riderTownships).values(
            townshipIds.map((townshipId) => ({
              riderId: rider.id,
              townshipId,
            })),
          );
        }
        return rider.id;
      });
      return this.getById(riderId);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Rider with email '${normalizeEmail(dto.email)}' already exists`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateRiderDto): Promise<RiderResponseDto> {
    const existing = await this.riderOrThrow(id);
    const email = dto.email ? normalizeEmail(dto.email) : undefined;
    const passwordHash = dto.password
      ? await hashPassword(dto.password)
      : undefined;

    if (email && email !== existing.email) {
      const emailOwner = await this.database.db.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true },
      });
      if (emailOwner) {
        throw new ConflictException(`User with email '${email}' already exists`);
      }
    }

    try {
      await this.database.db.transaction(async (tx) => {
        let nextTownshipIds: string[] = [];
        if (dto.townshipIds !== undefined || dto.status === 'INACTIVE') {
          const [lockedRider] = await tx
            .select({ id: riders.id })
            .from(riders)
            .where(eq(riders.id, id))
            .for('update');
          if (!lockedRider) throw new NotFoundException(`Rider '${id}' not found`);
          const currentAssignments = await tx
            .select({ townshipId: riderTownships.townshipId })
            .from(riderTownships)
            .where(eq(riderTownships.riderId, id));
          const currentTownshipIds = currentAssignments.map(
            (assignment) => assignment.townshipId,
          );
          nextTownshipIds = this.uniqueTownshipIds(
            dto.townshipIds ?? currentTownshipIds,
          );
          if (dto.townshipIds !== undefined) {
            await this.validateTownships(tx, nextTownshipIds);
          }
          await this.lockTownshipRotations(tx, [
            ...currentTownshipIds,
            ...nextTownshipIds,
          ]);
        }
        await tx
          .update(users)
          .set({
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(email !== undefined && { email }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
            ...(dto.status !== undefined && { status: dto.status }),
            ...(passwordHash !== undefined && {
              passwordHash,
              passwordChangedAt: new Date(),
            }),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.userId));
        await tx
          .update(riders)
          .set({
            ...(dto.vehicleType !== undefined && {
              vehicleType: dto.vehicleType,
            }),
            ...(dto.vehiclePlate !== undefined && {
              vehiclePlate: dto.vehiclePlate,
            }),
            ...(dto.licenseNo !== undefined && { licenseNo: dto.licenseNo }),
            ...(dto.nrcNumber !== undefined && { nrcNumber: dto.nrcNumber }),
            ...(dto.emergencyContactPhone !== undefined && {
              emergencyContactPhone: dto.emergencyContactPhone,
            }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
            updatedAt: new Date(),
          })
          .where(eq(riders.id, id));
        if (dto.townshipIds !== undefined) {
          await tx
            .delete(riderTownships)
            .where(eq(riderTownships.riderId, id));
          if (nextTownshipIds.length > 0) {
            await tx.insert(riderTownships).values(
              nextTownshipIds.map((townshipId) => ({
                riderId: id,
                townshipId,
              })),
            );
          }
        }
      });
      return this.getById(id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`User with email '${email}' already exists`);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.riderOrThrow(id);
    await this.database.db.transaction(async (tx) => {
      const [lockedRider] = await tx
        .select({ id: riders.id })
        .from(riders)
        .where(eq(riders.id, id))
        .for('update');
      if (!lockedRider) throw new NotFoundException(`Rider '${id}' not found`);
      const assignments = await tx
        .select({ townshipId: riderTownships.townshipId })
        .from(riderTownships)
        .where(eq(riderTownships.riderId, id));
      await this.lockTownshipRotations(
        tx,
        assignments.map((assignment) => assignment.townshipId),
      );
      await tx.delete(riders).where(eq(riders.id, id));
      await tx.delete(users).where(eq(users.id, existing.userId));
    });
  }

  private async riderOrThrow(id: string): Promise<RiderJoinedRow> {
    const [row] = await this.database.db
      .select({
        riderId: riders.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: users.status,
        vehicleType: riders.vehicleType,
        vehiclePlate: riders.vehiclePlate,
        licenseNo: riders.licenseNo,
        nrcNumber: riders.nrcNumber,
        emergencyContactPhone: riders.emergencyContactPhone,
        notes: riders.notes,
        createdAt: riders.createdAt,
        updatedAt: riders.updatedAt,
      })
      .from(riders)
      .innerJoin(users, eq(riders.userId, users.id))
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(riders.id, id), eq(roles.name, 'RIDER')));
    if (!row) throw new NotFoundException(`Rider '${id}' not found`);
    return row;
  }

  private uniqueTownshipIds(ids: string[]): string[] {
    return [...new Set(ids)].sort();
  }

  private async validateTownships(
    tx: RiderTransaction,
    townshipIds: string[],
  ): Promise<void> {
    if (townshipIds.length === 0) return;
    const rows = await tx
      .select({ id: townships.id })
      .from(townships)
      .where(inArray(townships.id, townshipIds));
    if (rows.length !== townshipIds.length) {
      throw new BadRequestException('One or more townships were not found');
    }
  }

  private async lockTownshipRotations(
    tx: RiderTransaction,
    townshipIds: string[],
  ): Promise<void> {
    const ids = this.uniqueTownshipIds(townshipIds);
    if (ids.length === 0) return;
    await tx
      .insert(townshipRotation)
      .values(ids.map((townshipId) => ({ townshipId })))
      .onConflictDoNothing();
    await tx
      .select({ townshipId: townshipRotation.townshipId })
      .from(townshipRotation)
      .where(inArray(townshipRotation.townshipId, ids))
      .orderBy(asc(townshipRotation.townshipId))
      .for('update');
  }

  private async townshipIdsForRider(riderId: string): Promise<string[]> {
    const assignments = await this.database.db
      .select({ townshipId: riderTownships.townshipId })
      .from(riderTownships)
      .where(eq(riderTownships.riderId, riderId))
      .orderBy(asc(riderTownships.townshipId));
    return assignments.map((assignment) => assignment.townshipId);
  }

  private async townshipIdsForRiders(
    riderIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    for (const riderId of riderIds) result.set(riderId, []);
    if (riderIds.length === 0) return result;
    const assignments = await this.database.db
      .select({ riderId: riderTownships.riderId, townshipId: riderTownships.townshipId })
      .from(riderTownships)
      .where(inArray(riderTownships.riderId, riderIds))
      .orderBy(asc(riderTownships.townshipId));
    for (const assignment of assignments) {
      result.get(assignment.riderId)?.push(assignment.townshipId);
    }
    return result;
  }
}
