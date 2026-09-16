import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'MANAGER',
    description: 'Uppercase role name, 2-32 chars, letters/digits/underscore',
  })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/, {
    message:
      'Role name must be uppercase, 2-32 chars, letters/digits/underscore',
  })
  name: string;

  @ApiPropertyOptional({ example: 'Operations manager' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
