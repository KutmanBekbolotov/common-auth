# Common Auth

NestJS auth service with PostgreSQL, Prisma, bcrypt password hashes, JWT access tokens, and refresh-cookie session renewal.

## Setup

Docker dev mode:

```bash
npm run docker:dev:build
```

This starts PostgreSQL and the API, runs `prisma generate`, applies the schema with `prisma db push`, and seeds the first admin.

Useful URLs:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Postgres: `localhost:5433`

Stop dev containers:

```bash
npm run docker:dev:down
```

Local setup without Docker:

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run start:dev
```

Required environment:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/common_auth?schema=public"
JWT_SECRET="change-me"
JWT_ACCESS_TTL="4h"
JWT_REFRESH_SECRET="change-me-refresh"
JWT_REFRESH_TTL="30d"
PASSWORD_SALT_ROUNDS="12"
SWAGGER_PATH="docs"
```

`npm run prisma:seed` creates the first `admin` from:

```bash
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="change-me-admin-password"
SEED_ADMIN_USERNAME="Admin"
```

## API

Frontend integration guide: [docs/frontend-integration.md](docs/frontend-integration.md).

Public:

- `GET /` - health response.
- `POST /auth/register` - body `{ "email": "...", "password": "...", "fullName": "...", "phone": "...", "pin": "..." }`, creates a public `Citizen` account, returns `accessToken`, auth context, and sets an `httpOnly` refresh cookie.
- `POST /auth/login` - body `{ "email": "...", "password": "..." }`, returns `accessToken`, auth context, and sets an `httpOnly` refresh cookie.
- `POST /auth/refresh` - rotates the refresh cookie and returns a new `accessToken` plus auth context.

Authenticated:

- `GET /auth/me` - current auth context.
- `POST /auth/logout` - clears the stored refresh session and expires the refresh cookie.

Admin only:

- `GET /admin/users/scope-options`
- `POST /admin/users/scope-options`
- `PATCH /admin/users/scope-options/:id`
- `DELETE /admin/users/scope-options/:id`
- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`
- `PATCH /admin/users/:id/role`
- `DELETE /admin/users/:id`

Use `Authorization: Bearer <accessToken>` for authenticated requests.

Supported roles:

```text
admin | ceo | license | spec | hr | ovk | TV | Practice | Terminal | SuperAdmin | INVENTORY_IT | INVENTORY_AHO | INVENTORY_ACCOUNTANT | INVENTORY_AUDITOR | Manager | Auditor | Operator | System | PRESSA | General-department | Citizen
```

`spec` users must have both `orgId` and `departmentId`. Inventory roles, `General-department`, and `Practice` do not require `orgId` or `departmentId`. `General-department` is for central apparatus users. `Practice` is intended for display-only users and should not be used for admin/distribution screens. Available `roles`, `orgId`, and `departmentId` values for admin forms are returned by `GET /admin/users/scope-options`.

## Checks

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npx prisma validate
```
