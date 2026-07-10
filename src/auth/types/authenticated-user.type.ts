import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  username: string | null;
  orgId: string | null;
  departmentId: string | null;
  position: string | null;
  photoUrl: string | null;
  disabled: boolean;
  sessionId: string | null;
};
