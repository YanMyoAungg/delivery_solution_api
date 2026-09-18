import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class CreateOrderDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID()
  shopId: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description:
      'Opaque package metadata; shape and physical units are not yet defined',
    type: Object,
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  packageInfo?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: '0.00', default: '0' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'deliveryFee must be a decimal string with up to 2 decimal places',
  })
  deliveryFee?: string;

  @ApiPropertyOptional({ example: '0.00', default: '0' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'codAmount must be a decimal string with up to 2 decimal places',
  })
  codAmount?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
