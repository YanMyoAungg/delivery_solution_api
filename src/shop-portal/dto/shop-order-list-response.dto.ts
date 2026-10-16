import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SHOP_DISPLAY_STATUSES, type ShopDisplayStatus } from '../shop-display-status.util.js';

export class ShopOrderListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() trackingCode!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ nullable: true }) customerPhone!: string | null;
  @ApiPropertyOptional({ nullable: true }) deliveryAddress!: string | null;
  @ApiPropertyOptional({ nullable: true }) townshipName!: string | null;
  @ApiProperty() packagePrice!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() total!: string;
  @ApiProperty() codToCollect!: string;
  @ApiProperty() netOwedToShop!: string;
  @ApiProperty() isPackagePaidToShop!: boolean;
  @ApiProperty() isFeePaidToShop!: boolean;
  @ApiProperty({ enum: SHOP_DISPLAY_STATUSES }) displayStatus!: ShopDisplayStatus;
  @ApiProperty() needsAttention!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) deliveredAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) estimatedDeliveryDate!: string | null;
}

export class ShopOrderListMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() perPage!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class ShopOrderListTotalsDto {
  @ApiProperty() orderCount!: number;
  @ApiProperty() packagePrice!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() total!: string;
  @ApiProperty() codToCollect!: string;
  @ApiProperty() netOwedToShop!: string;
}

export class ShopOrderListResponseDto {
  @ApiProperty({ type: [ShopOrderListItemDto] }) data!: ShopOrderListItemDto[];
  @ApiProperty({ type: ShopOrderListMetaDto }) meta!: ShopOrderListMetaDto;
  @ApiProperty({ type: ShopOrderListTotalsDto }) totals!: ShopOrderListTotalsDto;
}
