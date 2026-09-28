import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTownshipDto {
  @ApiProperty({ example: 'Hlaing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
