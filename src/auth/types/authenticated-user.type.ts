import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  username: string | null;
  orgId: string | null;
  departmentId: string | null;
  photoUrl: string | null;
  disabled: boolean;
};
