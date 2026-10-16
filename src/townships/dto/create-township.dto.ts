import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_AMOUNT_PATTERN } from '../../common/utils/money.util.js';

export class CreateTownshipDto {
  @ApiProperty({ example: 'Hlaing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '3500.00' })
  @IsString()
  @Matches(MONEY_AMOUNT_PATTERN, {
    message: 'defaultDeliveryFee must be a decimal string with up to 2 decimal places',
  })
  defaultDeliveryFee: string;
}
