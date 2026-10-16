import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../common/database/database.service.js';
import { isUniqueViolation } from '../common/database/is-unique-violation.js';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto.js';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto.js';
import { DeliveryPartnerResponseDto } from './dto/delivery-partner-response.dto.js';
import { deliveryPartners } from './delivery-partner.schema.js';

type DeliveryPartnerRow = typeof deliveryPartners.$inferSelect;

function toDeliveryPartnerResponse(row: DeliveryPartnerRow): DeliveryPartnerResponseDto {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

@Injectable()
export class DeliveryPartnersService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<DeliveryPartnerResponseDto[]> {
    const rows = await this.database.db.select().from(deliveryPartners).orderBy(deliveryPartners.name);
    return rows.map(toDeliveryPartnerResponse);
  }

  async getById(id: string): Promise<DeliveryPartnerResponseDto> {
    return toDeliveryPartnerResponse(await this.partnerOrThrow(id));
  }

  async create(input: CreateDeliveryPartnerDto): Promise<DeliveryPartnerResponseDto> {
    try {
      const [row] = await this.database.db.insert(deliveryPartners).values({
        name: input.name.trim(), phone: input.phone ?? null, note: input.note ?? null,
        isActive: input.isActive ?? true,
      }).returning();
      return toDeliveryPartnerResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Delivery partner '${input.name.trim()}' already exists`);
      throw error;
    }
  }

  async update(id: string, input: UpdateDeliveryPartnerDto): Promise<DeliveryPartnerResponseDto> {
    await this.partnerOrThrow(id);
    try {
      const [row] = await this.database.db.update(deliveryPartners).set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.note !== undefined && { note: input.note }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      }).where(eq(deliveryPartners.id, id)).returning();
      return toDeliveryPartnerResponse(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Delivery partner '${input.name?.trim()}' already exists`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.partnerOrThrow(id);
    await this.database.db.delete(deliveryPartners).where(eq(deliveryPartners.id, id));
  }

  private async partnerOrThrow(id: string): Promise<DeliveryPartnerRow> {
    const row = await this.database.db.query.deliveryPartners.findFirst({ where: eq(deliveryPartners.id, id) });
    if (!row) throw new NotFoundException(`Delivery partner '${id}' not found`);
    return row;
  }
}
