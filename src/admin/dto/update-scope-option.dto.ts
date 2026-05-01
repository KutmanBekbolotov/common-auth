import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateScopeOptionDto {
  @ApiProperty({ example: 'Bishkek New' })
  @IsString()
  value: string;
}
