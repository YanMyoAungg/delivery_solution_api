import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHOP_CHANNEL_TYPES, type ShopChannelType } from '../shop.schema.js';

export class UpdateShopDto {
  @ApiPropertyOptional({ example: 'Yangon Fresh Market Updated' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: '09876543210', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({
    example: 'No. 34, Merchant Street, Yangon',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ example: 'Updated points of contact', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({
    enum: SHOP_CHANNEL_TYPES,
    enumName: 'ShopChannelType',
  })
  @IsOptional()
  @IsEnum(SHOP_CHANNEL_TYPES)
  channelType?: ShopChannelType;

  @ApiPropertyOptional({ example: 'Yangon Fresh Market Group' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  channelName?: string;
}
