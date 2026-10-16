import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SendBackOrderDto {
  @ApiProperty({ description: 'Reason visible to the shop', minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ description: 'Internal note, not visible to the shop', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(2000)
  internalNote: string;
}
