import { ApiProperty } from '@nestjs/swagger';

export class AssignableRiderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'John Rider' })
  name: string;
}
