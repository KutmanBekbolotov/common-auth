import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_USER_ROLES } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { AdminUsersService } from './admin-users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_USER_ROLES)
@ApiTags('admin users')
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.SuperAdmin, UserRole.Manager)
  @ApiOperation({ summary: 'List users' })
  listUsers(
    @Query() query: ListUsersQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.listUsers(query, request.user);
  }

  @Post()
  @ApiOperation({ summary: 'Create user' })
  createUser(@Body() dto: CreateUserDto) {
    return this.adminUsersService.createUser(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile and scope' })
  @ApiParam({ name: 'id', example: 'user-id' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.updateUser(id, dto, request.user.id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role' })
  @ApiParam({ name: 'id', example: 'user-id' })
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.updateUserRole(id, dto.role, request.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user' })
  @ApiParam({ name: 'id', example: 'user-id' })
  deleteUser(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.adminUsersService.deleteUser(id, request.user.id);
  }
}
