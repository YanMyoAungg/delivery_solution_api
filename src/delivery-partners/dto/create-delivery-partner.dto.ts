import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeliveryPartnerDto {
  @ApiProperty() @IsString() @MaxLength(120) name: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}
