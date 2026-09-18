import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDeliveryDto {
  @ApiProperty()
  @IsUUID('4')
  riderId: string;
}
