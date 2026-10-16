import { ApiProperty } from '@nestjs/swagger';
import { SHOP_DISPLAY_STATUSES, type ShopDisplayStatus } from '../shop-display-status.util.js';

export class ShopDashboardCountsDto {
  @ApiProperty() received!: number;
  @ApiProperty() outForDelivery!: number;
  @ApiProperty() delivered!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty() needsAttention!: number;
}

export class ShopDashboardMoneyDto {
  @ApiProperty() codCollected!: string;
  @ApiProperty() netSettlementDelivered!: string;
  @ApiProperty() codExpected!: string;
  @ApiProperty() netOwedOpen!: string;
}

export class ShopOrdersPerDayDto {
  @ApiProperty() date!: string;
  @ApiProperty({ enum: SHOP_DISPLAY_STATUSES }) displayStatus!: ShopDisplayStatus;
  @ApiProperty() orderCount!: number;
}

export class ShopDashboardResponseDto {
  @ApiProperty() dateFrom!: string;
  @ApiProperty() dateTo!: string;
  @ApiProperty() dateBasis!: string;
  @ApiProperty({ type: ShopDashboardCountsDto }) counts!: ShopDashboardCountsDto;
  @ApiProperty({ type: ShopDashboardMoneyDto }) money!: ShopDashboardMoneyDto;
  @ApiProperty({ type: [ShopOrdersPerDayDto] }) ordersPerDayByStatus!: ShopOrdersPerDayDto[];
}
