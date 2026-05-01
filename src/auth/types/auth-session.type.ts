import type { AuthContextResponse } from '../../users/user.presenter';

export type AuthSessionResponse = AuthContextResponse & {
  accessToken: string;
};

export type AuthSession = AuthSessionResponse & {
  refreshToken: string;
};
