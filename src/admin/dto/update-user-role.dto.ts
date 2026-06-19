import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { PUBLIC_USER_ROLES, toPrismaUserRole } from '../../users/user-role';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: PUBLIC_USER_ROLES, example: UserRole.Operator })
  @Transform(({ value }) => toPrismaUserRole(value))
  @IsEnum(UserRole)
  role: UserRole;
}
