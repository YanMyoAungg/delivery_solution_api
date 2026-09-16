import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class MeResponseDto {
  @ApiProperty({
    description: 'Authenticated user profile',
    type: () => UserResponseDto,
  })
  user: UserResponseDto;

  @ApiProperty({ description: 'Effective permission keys for the user role' })
  permissions: string[];
}
