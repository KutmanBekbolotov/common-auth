import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PUBLIC_USER_ROLES, toPrismaUserRole } from '../../users/user-role';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: PUBLIC_USER_ROLES, example: UserRole.Manager })
  @Transform(({ value }) => toPrismaUserRole(value))
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ example: 'Ivan Ivanov' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'Bishkek' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ example: 'Osh-City' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ example: 'Главный специалист' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsUrl({ require_tld: false })
  photoUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Optional legacy Firestore avatar field. Omit it when avatar is not set; empty string clears avatar.',
    example: '',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsUrl({ require_tld: false })
  ProfilePic?: string | null;

  @ApiPropertyOptional({ example: 'firebase-uid' })
  @IsOptional()
  @IsString()
  legacyFirebaseUid?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
