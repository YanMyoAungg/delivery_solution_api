import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@mail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password1234' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
