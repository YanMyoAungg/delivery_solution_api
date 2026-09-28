import { ApiProperty } from '@nestjs/swagger';

export class TownshipResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Hlaing' })
  name: string;

  @ApiProperty({ description: 'Whether an ACTIVE rider is assigned to this township' })
  selectable: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
