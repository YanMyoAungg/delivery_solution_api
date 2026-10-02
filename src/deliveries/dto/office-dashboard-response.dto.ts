import { ApiProperty } from '@nestjs/swagger';
import { DELIVERY_HISTORY_EVENTS, type DeliveryHistoryEvent } from '../delivery.schema.js';

export class OfficeDashboardSummaryDto {
  @ApiProperty({ example: 24 })
  ordersCreated: number;

  @ApiProperty({ example: 8, description: 'Current assigned orders, across all dates' })
  openAssignments: number;

  @ApiProperty({ example: 12 })
  delivered: number;

  @ApiProperty({ example: 2 })
  failed: number;

  @ApiProperty({ example: 85.71, description: 'Percent of completed attempts delivered on the selected date' })
  successRate: number;
}

export class OfficeDashboardOpenWorkDto {
  @ApiProperty()
  riderId: string;

  @ApiProperty()
  riderName: string;

  @ApiProperty()
  townshipId: string;

  @ApiProperty()
  townshipName: string;

  @ApiProperty({ example: 4 })
  count: number;
}

export class OfficeDashboardActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  trackingCode: string;

  @ApiProperty()
  townshipName: string;

  @ApiProperty({ nullable: true })
  riderName: string | null;

  @ApiProperty({ nullable: true })
  previousRiderName: string | null;

  @ApiProperty({ enum: DELIVERY_HISTORY_EVENTS, enumName: 'DeliveryHistoryEvent' })
  event: DeliveryHistoryEvent;

  @ApiProperty()
  createdAt: string;
}

export class OfficeDashboardFailedOrderDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty()
  trackingCode: string;

  @ApiProperty()
  townshipName: string;

  @ApiProperty({ nullable: true })
  riderName: string | null;

  @ApiProperty()
  attemptNumber: number;

  @ApiProperty()
  failedAt: string;
}

export class OfficeDashboardResponseDto {
  @ApiProperty({ example: '2026-10-03' })
  date: string;

  @ApiProperty({ type: OfficeDashboardSummaryDto })
  summary: OfficeDashboardSummaryDto;

  @ApiProperty({ type: [OfficeDashboardOpenWorkDto] })
  openWork: OfficeDashboardOpenWorkDto[];

  @ApiProperty({ type: [OfficeDashboardActivityDto] })
  recentActivity: OfficeDashboardActivityDto[];

  @ApiProperty({ type: [OfficeDashboardFailedOrderDto] })
  failedOrders: OfficeDashboardFailedOrderDto[];
}
