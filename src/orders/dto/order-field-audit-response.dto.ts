import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderFieldAuditResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty() field: string;
  @ApiPropertyOptional({ nullable: true }) oldValue: unknown;
  @ApiPropertyOptional({ nullable: true }) newValue: unknown;
  @ApiPropertyOptional({ nullable: true }) actorId: string | null;
  @ApiPropertyOptional({ nullable: true }) reason: string | null;
  @ApiProperty() createdAt: string;
}
