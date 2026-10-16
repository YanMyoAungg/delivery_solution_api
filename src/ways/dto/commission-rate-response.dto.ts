import { ApiProperty } from '@nestjs/swagger';

export class CommissionRateResponseDto {
  @ApiProperty({ example: 'commissionPerWay' })
  key!: 'commissionPerWay';

  @ApiProperty({ example: '500.00' })
  value!: string;
}
