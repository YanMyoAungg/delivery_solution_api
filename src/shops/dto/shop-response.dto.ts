import { ApiProperty } from '@nestjs/swagger';
import { SHOP_CHANNEL_TYPES, type ShopChannelType } from '../shop.schema.js';

export class ShopResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Yangon Fresh Market' })
  name: string;

  @ApiProperty({ example: '09123456789', nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'No. 12, Bogyoke Road, Yangon', nullable: true })
  address: string | null;

  @ApiProperty({
    example: 'Preferred delivery contact: shop manager',
    nullable: true,
  })
  notes: string | null;

  @ApiProperty({ enum: SHOP_CHANNEL_TYPES, enumName: 'ShopChannelType' })
  channelType: ShopChannelType;

  @ApiProperty({ example: 'Yangon Fresh Market Group' })
  channelName: string;

  @ApiProperty({ example: '2026-09-17T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-17T10:00:00.000Z' })
  updatedAt: string;
}
