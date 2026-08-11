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
JWT_ACCESS_TTL="15m"
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
- `POST /auth/refresh` - rotates the `refresh_token` cookie and returns a new `accessToken` plus auth context.

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

Access tokens are JWTs with `sub`, `sid`, `email`, `type`, `iat`, and `exp`.
Refresh tokens are opaque random strings stored only in an `httpOnly`
`refresh_token` cookie; only their SHA-256 hash is stored in PostgreSQL.

Supported roles:

```text
common | admin | ceo | license | spec | hr | ovk | TV | Practice | practice_manager | Terminal | SuperAdmin | INVENTORY_IT | INVENTORY_AHO | INVENTORY_ACCOUNTANT | INVENTORY_AUDITOR | Manager | Auditor | Operator | System | PRESSA | General-department | Citizen
```

`spec` users must have both `orgId` and `departmentId`. Inventory roles, `General-department`, `Practice`, and `practice_manager` do not require `orgId` or `departmentId`. `General-department` is for central apparatus users. `Practice` is intended for display-only users and should not be used for admin/distribution screens. `practice_manager` is intended only for managing cadet distribution for the practical exam and receives `permissions.practiceExamDistribution = true` without cloud/admin access. Available `roles`, `orgId`, and `departmentId` values for admin forms are returned by `GET /admin/users/scope-options`.

## Checks

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npx prisma validate
```

## Employee Directory Import

The employee import reads the restored employee directory database and syncs
staff into `users` with `username`, `phone`, `orgId`, `departmentId`,
`position`, `role`, and `disabled`.

Configure the two databases in `.env`:

```bash
EMPLOYEE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/employee_analysis"
AUTH_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/common_auth?schema=public"
EMPLOYEE_IMPORT_DEFAULT_PASSWORD="change-me-employee-password"
```

Recommended flow:

```bash
npm run import:employees:report
npm run import:employees:dry-run
npm run import:employees
```

`report` only reads the employee source. `dry-run` reads both databases and
prints create/update counts without writing. The import preserves manual auth
roles such as `admin`, `SuperAdmin`, service, display, and inventory roles by
default. Active mapped employees are enabled; inactive employees and unmapped
new employees stay disabled.
