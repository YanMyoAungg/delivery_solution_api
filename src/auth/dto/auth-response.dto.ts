import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({
    description: 'Authenticated user',
    type: () => UserResponseDto,
  })
  user: UserResponseDto;

  @ApiProperty({ description: 'Effective permission keys for the user role' })
  permissions: string[];
}
