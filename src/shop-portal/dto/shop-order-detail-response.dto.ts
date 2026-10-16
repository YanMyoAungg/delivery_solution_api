import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SHOP_DISPLAY_STATUSES, type ShopDisplayStatus } from '../shop-display-status.util.js';

export class ShopOrderHistoryEventDto {
  @ApiProperty() createdAt!: string;
  @ApiProperty({ enum: SHOP_DISPLAY_STATUSES }) displayStatus!: ShopDisplayStatus;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
}

export class ShopOrderDetailResponseDto {
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
  @ApiProperty({ type: [ShopOrderHistoryEventDto] }) history!: ShopOrderHistoryEventDto[];
}
