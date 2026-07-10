import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { toAuthResponseUser } from '../users/user.presenter';
import { AdminUserScopeOptionsService } from './admin-user-scope-options.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const REQUIRED_SCOPE_USER_ROLES: UserRole[] = [UserRole.spec];

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly adminUserScopeOptionsService: AdminUserScopeOptionsService,
  ) {}

  async listUsers(query: ListUsersQueryDto = {}, actor?: AuthenticatedUser) {
    const where = this.buildListUsersWhere(query, actor);
    const take = query.limit
      ? Math.min(Math.max(query.limit, 1), 200)
      : undefined;
    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      take,
    });

    return {
      users: users.map((user) => toAuthResponseUser(user)),
    };
  }

  private buildListUsersWhere(
    query: ListUsersQueryDto,
    actor?: AuthenticatedUser,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    const search = this.normalizeOptionalString(query.query);

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
        { orgId: { contains: search, mode: 'insensitive' } },
        { departmentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (actor?.role === UserRole.Manager) {
      if (!actor.orgId || !actor.departmentId) {
        return { id: '__manager_without_scope__' };
      }

      return {
        ...where,
        role: UserRole.Operator,
        orgId: actor.orgId,
        departmentId: actor.departmentId,
      };
    }

    const orgId = this.normalizeOptionalString(query.orgId);
    const departmentId = this.normalizeOptionalString(query.departmentId);

    if (query.role) {
      where.role = query.role;
    }

    if (orgId) {
      where.orgId = orgId;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    return where;
  }

  async createUser(dto: CreateUserDto) {
    const orgId = this.normalizeOptionalString(dto.orgId);
    const departmentId = this.normalizeOptionalString(dto.departmentId);

    await this.adminUserScopeOptionsService.assertScopeOptionExists(
      'orgId',
      orgId,
    );
    await this.adminUserScopeOptionsService.assertScopeOptionExists(
      'departmentId',
      departmentId,
    );
    this.assertRoleScope(dto.role, orgId, departmentId);

    const passwordHash = await bcrypt.hash(
      dto.password,
      Number(this.configService.get<string>('PASSWORD_SALT_ROUNDS') ?? 12),
    );

    try {
      const user = await this.prisma.user.create({
        data: {
          email: this.normalizeEmail(dto.email),
          passwordHash,
          role: dto.role,
          username: this.normalizeOptionalString(dto.username),
          orgId,
          departmentId,
          position: this.normalizeOptionalString(dto.position),
          photoUrl: this.normalizePhotoUrl(dto.photoUrl, dto.ProfilePic),
          legacyFirebaseUid: this.normalizeOptionalString(
            dto.legacyFirebaseUid,
          ),
          disabled: dto.disabled ?? false,
        },
      });

      return {
        user: toAuthResponseUser(user),
      };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    const existingUser = await this.getExistingUser(id);

    if (this.fieldWasProvided(dto, 'role') && this.valueIsMissing(dto.role)) {
      throw new BadRequestException('role is required when provided');
    }

    const nextRole = dto.role ?? existingUser.role;
    const nextOrgId = this.fieldWasProvided(dto, 'orgId')
      ? this.normalizeOptionalString(dto.orgId)
      : existingUser.orgId;
    const nextDepartmentId = this.fieldWasProvided(dto, 'departmentId')
      ? this.normalizeOptionalString(dto.departmentId)
      : existingUser.departmentId;

    await this.adminUserScopeOptionsService.assertScopeOptionExists(
      'orgId',
      nextOrgId,
    );
    await this.adminUserScopeOptionsService.assertScopeOptionExists(
      'departmentId',
      nextDepartmentId,
    );

    if (
      id === actorId &&
      this.isAdministrativeRole(existingUser.role) &&
      nextRole !== existingUser.role
    ) {
      throw new BadRequestException(
        'Administrative user cannot change own role',
      );
    }

    if (id === actorId && dto.disabled === true) {
      throw new BadRequestException('Admin cannot disable own account');
    }

    this.assertRoleScope(nextRole, nextOrgId, nextDepartmentId);

    const data: Prisma.UserUpdateInput = {};

    if (this.fieldWasProvided(dto, 'email')) {
      const email = dto.email;

      if (!email) {
        throw new BadRequestException('email is required when provided');
      }

      data.email = this.normalizeEmail(email);
    }

    if (this.fieldWasProvided(dto, 'role')) {
      data.role = nextRole;
    }

    if (this.fieldWasProvided(dto, 'username')) {
      data.username = this.normalizeOptionalString(dto.username);
    }

    if (this.fieldWasProvided(dto, 'orgId')) {
      data.orgId = nextOrgId;
    }

    if (this.fieldWasProvided(dto, 'departmentId')) {
      data.departmentId = nextDepartmentId;
    }

    if (this.fieldWasProvided(dto, 'position')) {
      data.position = this.normalizeOptionalString(dto.position);
    }

    if (
      this.fieldWasProvided(dto, 'photoUrl') ||
      this.fieldWasProvided(dto, 'ProfilePic')
    ) {
      data.photoUrl = this.normalizePhotoUrl(dto.photoUrl, dto.ProfilePic);
    }

    if (this.fieldWasProvided(dto, 'legacyFirebaseUid')) {
      data.legacyFirebaseUid = this.normalizeOptionalString(
        dto.legacyFirebaseUid,
      );
    }

    if (
      this.fieldWasProvided(dto, 'disabled') &&
      this.valueIsMissing(dto.disabled)
    ) {
      throw new BadRequestException('disabled is required when provided');
    }

    if (this.fieldWasProvided(dto, 'disabled')) {
      data.disabled = dto.disabled;
    }

    if (Object.keys(data).length === 0) {
      return {
        user: toAuthResponseUser(existingUser),
      };
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
      });

      return {
        user: toAuthResponseUser(user),
      };
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async updateUserRole(id: string, role: UserRole, actorId: string) {
    const existingUser = await this.getExistingUser(id);

    if (
      id === actorId &&
      this.isAdministrativeRole(existingUser.role) &&
      role !== existingUser.role
    ) {
      throw new BadRequestException(
        'Administrative user cannot change own role',
      );
    }

    await this.adminUserScopeOptionsService.assertScopeOptionExists(
      'orgId',
      existingUser.orgId,
    );
    await this.adminUserScopeOptionsService.assertScopeOptionExists(
      'departmentId',
      existingUser.departmentId,
    );
    this.assertRoleScope(role, existingUser.orgId, existingUser.departmentId);

    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
    });

    return {
      user: toAuthResponseUser(user),
    };
  }

  async deleteUser(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('Admin cannot delete own account');
    }

    await this.getExistingUser(id);
    await this.prisma.user.delete({ where: { id } });

    return { success: true };
  }

  private async getExistingUser(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private assertRoleScope(
    role: UserRole,
    orgId: string | null | undefined,
    departmentId: string | null | undefined,
  ) {
    if (!REQUIRED_SCOPE_USER_ROLES.includes(role)) {
      return;
    }

    if (!orgId || !departmentId) {
      throw new BadRequestException(
        'spec users require orgId and departmentId',
      );
    }
  }

  private handleUniqueConstraint(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'User with this email or Firebase UID already exists',
      );
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeOptionalString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizePhotoUrl(
    photoUrl?: string | null,
    profilePic?: string | null,
  ): string | null {
    return this.normalizeOptionalString(photoUrl ?? profilePic ?? undefined);
  }

  private fieldWasProvided<T extends object>(dto: T, field: keyof T): boolean {
    return Object.hasOwn(dto, field);
  }

  private valueIsMissing(value: unknown): value is null | undefined {
    return value === undefined || value === null;
  }

  private isAdministrativeRole(role: UserRole): boolean {
    return ADMIN_USER_ROLES.includes(role);
  }
}
