import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUserScopeOptionsController } from './admin-user-scope-options.controller';
import { AdminUserScopeOptionsService } from './admin-user-scope-options.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController, AdminUserScopeOptionsController],
  providers: [AdminUsersService, AdminUserScopeOptionsService],
})
export class AdminModule {}
