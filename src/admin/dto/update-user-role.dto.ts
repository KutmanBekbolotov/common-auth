import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.hr })
  @IsEnum(UserRole)
  role: UserRole;
}
