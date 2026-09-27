import { ApiProperty } from '@nestjs/swagger';
import { PickupResponseDto } from './pickup-response.dto.js';

class PickupListMetaDto {
  @ApiProperty()
  page: number;
  @ApiProperty()
  perPage: number;
  @ApiProperty()
  total: number;
  @ApiProperty()
  totalPages: number;
}

export class PickupListResponseDto {
  @ApiProperty({ type: [PickupResponseDto] })
  data: PickupResponseDto[];

  @ApiProperty({ type: PickupListMetaDto })
  meta: PickupListMetaDto;
}
