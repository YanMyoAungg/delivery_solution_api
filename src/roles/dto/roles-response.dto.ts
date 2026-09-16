import { ApiProperty } from '@nestjs/swagger';

export class RoleResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'MANAGER' })
  name: string;

  @ApiProperty({ example: 'Floor manager', nullable: true })
  description: string | null;

  @ApiProperty({ example: false })
  isSystem: boolean;

  @ApiProperty({ example: 3 })
  userCount: number;
}
