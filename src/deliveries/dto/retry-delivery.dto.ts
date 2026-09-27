import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RetryDeliveryDto {
  @ApiProperty()
  @IsUUID('4')
  riderId: string;
}
