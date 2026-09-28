import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SHOP_CHANNEL_TYPES, type ShopChannelType } from '../shop.schema.js';

export class ShopResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Yangon Central Shop' })
  name: string;

  @ApiPropertyOptional({ example: '09123456789', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'No. 1, Main Road', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: 'Deliver before 6pm', nullable: true })
  notes: string | null;

  @ApiProperty({
    enum: SHOP_CHANNEL_TYPES,
    enumName: 'ShopChannelType',
    example: 'VIBER',
  })
  channelType: ShopChannelType;

  @ApiProperty({ example: 'YangonCentralShop' })
  channelName: string;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  updatedAt: string;
}
