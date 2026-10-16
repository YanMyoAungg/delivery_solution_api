import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCommissionRateDto {
  @ApiProperty({ example: '500.00', pattern: '^\\d+(\\.\\d{1,2})?$' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  @MaxLength(13)
  value!: string;
}
