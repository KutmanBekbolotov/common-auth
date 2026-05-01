import { ApiProperty } from '@nestjs/swagger';
import { ScopeOptionType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateScopeOptionDto {
  @ApiProperty({ enum: ScopeOptionType, example: ScopeOptionType.orgId })
  @IsEnum(ScopeOptionType)
  type: ScopeOptionType;

  @ApiProperty({ example: 'Bishkek' })
  @IsString()
  value: string;
}
