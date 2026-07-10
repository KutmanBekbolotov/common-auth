import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import {
  ACCEPTED_USER_ROLE_VALUES,
  toPrismaUserRole,
} from '../../users/user-role';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ACCEPTED_USER_ROLE_VALUES, example: 'operator' })
  @Transform(({ value }) => toPrismaUserRole(value))
  @IsEnum(UserRole)
  role: UserRole;
}
