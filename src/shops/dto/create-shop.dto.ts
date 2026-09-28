import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SHOP_CHANNEL_TYPES, type ShopChannelType } from '../shop.schema.js';

export class CreateShopDto {
  @ApiProperty({ example: 'Yangon Central Shop' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: '09123456789', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'No. 1, Main Road', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ example: 'Deliver before 6pm' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiProperty({
    enum: SHOP_CHANNEL_TYPES,
    enumName: 'ShopChannelType',
    example: 'VIBER',
  })
  @IsEnum(SHOP_CHANNEL_TYPES)
  channelType: ShopChannelType;

  @ApiProperty({ example: 'YangonCentralShop' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  channelName: string;
}
