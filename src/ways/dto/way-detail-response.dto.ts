import { ApiProperty } from '@nestjs/swagger';
import { WayOrderResponseDto } from './way-order-response.dto.js';
import { WayResponseDto } from './way-response.dto.js';

export class WayDetailResponseDto extends WayResponseDto {
  @ApiProperty({ type: [WayOrderResponseDto] })
  orders!: WayOrderResponseDto[];
}
