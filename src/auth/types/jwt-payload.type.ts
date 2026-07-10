export type JwtPayload = {
  sub: string;
  sid?: string;
  email: string;
  type?: 'access' | 'refresh';
};
