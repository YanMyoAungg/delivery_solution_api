import { ApiProperty } from '@nestjs/swagger';

export class RiderDashboardResponseDto {
  @ApiProperty({ example: '2026-09-29' })
  date: string;

  @ApiProperty({ description: 'Assigned attempts in the date cohort that remain open' })
  assigned: number;

  @ApiProperty()
  delivered: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ description: 'Percentage from 0 to 100; zero when there are no completed attempts' })
  successRate: number;

  @ApiProperty({ example: '12000.00' })
  codCollected: string;

  @ApiProperty({ example: '45000.00' })
  codOutstanding: string;
}
