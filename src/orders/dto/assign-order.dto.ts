import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignOrderDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  riderId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  partnerId?: string | null;
}
