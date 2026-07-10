import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  ACCEPTED_USER_ROLE_VALUES,
  toPrismaUserRole,
} from '../../users/user-role';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ example: 'ivanov' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 'Bishkek' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ example: 'Восточный отдел' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ enum: ACCEPTED_USER_ROLE_VALUES, example: 'operator' })
  @IsOptional()
  @Transform(({ value }) => toPrismaUserRole(value))
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
