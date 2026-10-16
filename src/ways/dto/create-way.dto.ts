import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateWayDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  riderId!: string;
}
