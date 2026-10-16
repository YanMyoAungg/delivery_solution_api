import { ApiProperty } from '@nestjs/swagger';

export class TownshipResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Hlaing' })
  name: string;

  @ApiProperty({ example: '3500.00' })
  defaultDeliveryFee: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
