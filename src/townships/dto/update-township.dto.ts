import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_AMOUNT_PATTERN } from '../../common/utils/money.util.js';

export class UpdateTownshipDto {
  @ApiPropertyOptional({ example: 'Hlaing' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '3500.00' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_AMOUNT_PATTERN, {
    message: 'defaultDeliveryFee must be a decimal string with up to 2 decimal places',
  })
  defaultDeliveryFee?: string;
}
