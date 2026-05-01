import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminUserScopeOptionsService } from './admin-user-scope-options.service';
import { CreateScopeOptionDto } from './dto/create-scope-option.dto';
import { UpdateScopeOptionDto } from './dto/update-scope-option.dto';

@Controller('admin/users/scope-options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@ApiTags('admin user scope options')
@ApiBearerAuth()
export class AdminUserScopeOptionsController {
  constructor(
    private readonly adminUserScopeOptionsService: AdminUserScopeOptionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List available orgId and departmentId values' })
  listScopeOptions() {
    return this.adminUserScopeOptionsService.listScopeOptions();
  }

  @Post()
  @ApiOperation({ summary: 'Create orgId or departmentId option' })
  createScopeOption(@Body() dto: CreateScopeOptionDto) {
    return this.adminUserScopeOptionsService.createScopeOption(
      dto.type,
      dto.value,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename orgId or departmentId option' })
  @ApiParam({ name: 'id', example: 'scope-option-id' })
  updateScopeOption(
    @Param('id') id: string,
    @Body() dto: UpdateScopeOptionDto,
  ) {
    return this.adminUserScopeOptionsService.updateScopeOption(id, dto.value);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete orgId or departmentId option' })
  @ApiParam({ name: 'id', example: 'scope-option-id' })
  deleteScopeOption(@Param('id') id: string) {
    return this.adminUserScopeOptionsService.deleteScopeOption(id);
  }
}
