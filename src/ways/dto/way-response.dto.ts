import { ApiProperty } from '@nestjs/swagger';
import { WAY_STATES, type WayState } from './way-state.js';

export class WayResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) riderId!: string;
  @ApiProperty() riderName!: string;
  @ApiProperty({ example: '2026-10-16', format: 'date' }) wayDate!: string;
  @ApiProperty({ example: 1 }) sequence!: number;
  @ApiProperty({ example: '500.00' }) commissionRate!: string;
  @ApiProperty() isOpen!: boolean;
  @ApiProperty({ enum: WAY_STATES }) state!: WayState;
  @ApiProperty() orderCount!: number;
  @ApiProperty({ example: '500.00' }) commissionAmount!: string;
  @ApiProperty({ example: '0.00' }) pendingAmount!: string;
  @ApiProperty() isPaidWithoutDelivery!: boolean;
  @ApiProperty({ nullable: true }) payAnywayReason!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) payAnywayBy!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' }) payAnywayAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
