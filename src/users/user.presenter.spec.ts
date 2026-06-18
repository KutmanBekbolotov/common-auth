import { UserRole } from '@prisma/client';
import { toAuthPermissions } from './user.presenter';

describe('user presenter permissions', () => {
  it('grants cloud access to SuperAdmin and System', () => {
    expect(toAuthPermissions(UserRole.SuperAdmin)).toEqual({ cloud: true });
    expect(toAuthPermissions(UserRole.System)).toEqual({ cloud: true });
  });

  it('keeps cloud access disabled for non-privileged roles', () => {
    expect(toAuthPermissions(UserRole.Manager)).toEqual({ cloud: false });
    expect(toAuthPermissions(UserRole.PRESSA)).toEqual({ cloud: false });
    expect(toAuthPermissions(UserRole.citizen)).toEqual({ cloud: false });
  });
});
