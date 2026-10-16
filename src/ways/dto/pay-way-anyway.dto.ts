import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class PayWayAnywayDto {
  @ApiProperty({ example: 'Customer package was lost before delivery' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'reason must not be blank' })
  @MaxLength(1000)
  reason!: string;
}
