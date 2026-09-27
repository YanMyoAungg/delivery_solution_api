import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SHOP_CHANNEL_TYPES, type ShopChannelType } from '../shop.schema.js';

export class CreateShopDto {
  @ApiProperty({ example: 'Yangon Fresh Market' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '09123456789', required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiProperty({ example: 'No. 12, Bogyoke Road, Yangon', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiProperty({
    example: 'Preferred delivery contact: shop manager',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiProperty({ enum: SHOP_CHANNEL_TYPES, enumName: 'ShopChannelType' })
  @IsEnum(SHOP_CHANNEL_TYPES)
  channelType: ShopChannelType;

  @ApiProperty({ example: 'Yangon Fresh Market Group' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  channelName: string;
}
