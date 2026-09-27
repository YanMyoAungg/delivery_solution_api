# Delivery Management System — Backend API

Backend for a delivery management application serving a single delivery company's operations: shops, customers, riders, orders, pickups, deliveries, returns, payments/COD, and scheduled notifications. This repository covers the **Foundation Phase** (application/API infrastructure, database layer, OpenAPI documentation, health check), **Phase 1 — Users, Authentication & RBAC** (JWT auth, role-based access control, user management), and **Phase 2 — Master Data** (shops, customers, riders). Remaining business feature modules are introduced in later phases.

## Tech Stack

- **Runtime/Framework:** Node.js, NestJS (Express platform), TypeScript
- **Package manager:** pnpm
- **Database:** PostgreSQL 18, Drizzle ORM + drizzle-kit, `postgres` driver
- **Cache/messaging:** Redis 8 (dev infrastructure for future background jobs)
- **Config/validation:** `@nestjs/config`, `class-validator`, `class-transformer`
- **API docs:** `@nestjs/swagger`
- **Quality:** ESLint (flat config), Prettier, Vitest (unit + e2e)

## Requirements

- Node.js v22.12+ (NestJS 12 requirement)
- pnpm 9+
- Docker with Docker Compose (for PostgreSQL and Redis)

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm start:dev
```

The API is served at `http://localhost:3000/api/v1`.

> If a local PostgreSQL is already running on port `5432`, set `DB_PORT` (and `DATABASE_URL`) to a free port such as `5433` in `.env` — the Compose file publishes Postgres on the host port from `DB_PORT`.

## Environment Configuration

Copy `.env.example` to `.env` and adjust values. The `VIBER_*` variables are placeholders for the future Viber integration. Configuration is centralized through `@nestjs/config` with validation in `src/config/env.validation.ts` — the application never reads `process.env` directly.

## Database Commands

```bash
pnpm db:generate   # generate Drizzle migrations from the schema
pnpm db:migrate    # apply migrations to the database
pnpm db:seed       # create the initial OWNER account (idempotent)
pnpm db:studio     # open Drizzle Studio for the database
```

Migrations also run automatically during application bootstrap. Seeding uses `SEED_OWNER_NAME/EMAIL/PASSWORD` from the environment (defaults: `System Owner <owner@mail.com>` / `Password1234`); `pnpm db:seed` also creates two admin accounts (`admin1@mail.com`, `admin2@mail.com` — same password). `pnpm db:reset` drops all data, re-runs migrations, and re-seeds.

## API

All routes are prefixed with the API prefix and versioned:

```text
/api/v1
```

## Health Check

```text
GET /api/v1/health
```

Performs a live PostgreSQL query (`SELECT 1`) and reports application and database health. Public — no authentication required.

## Authentication & Roles

All routes except `@Public()` ones require a JWT access token (`Authorization: Bearer <token>`). Tokens are issued by `POST /api/v1/auth/login` and verified by a global guard on every request.

```text
POST /api/v1/auth/login            # exchange credentials for an access token
GET  /api/v1/auth/me               # current user profile
POST /api/v1/auth/change-password  # rotate the current user's password
```

RBAC uses a **fixed module×action permission catalog** (spatie-style: `roles`, `permissions`, `role_permissions`, `users.role_id`). Roles are dynamic — OWNER/ADMIN create roles and assign per-role grants from the API/UI — but the 68 permission keys across 13 modules are seeded and read-only; adding a module is a code change to `MODULE_ACTIONS` in `src/common/auth/permission-keys.ts` plus a re-seed. Seeded roles:

| Role    | Scope |
|---------|-------|
| `OWNER` | System role (`is_system=true`) — holds every permission, cannot be deactivated/deleted via API |
| `ADMIN` | Office administration |
| `OFFICER`| Order/pickup/delivery operations — create/read/update on master data, never delete |
| `RIDER` | Delivery field worker (authenticated; no back-office administration) |

Authorization runs through the global `PermissionsGuard` + `@RequirePermissions(...)` decorator; effective permissions come from the role's grant rows (system roles short-circuit to the full catalog). The 68 seeded keys live in `src/common/auth/permission-keys.ts` (`MODULE_ACTIONS`/`PERMISSION_KEYS`/`PermissionKey`); routes without `@RequirePermissions` allow any authenticated user.

```text
GET    /api/v1/users            # list users (search, filters, pagination)
POST   /api/v1/users            # create user
GET    /api/v1/users/:id        # get user
PATCH  /api/v1/users/:id        # update user (profile, role, status, password reset)
DELETE /api/v1/users/:id        # delete user
```

### Master Data

All three modules expose the same five routes. `:id` is the row id, except for riders where it is the backing `users.id` (riders are 1:1 with a `RIDER`-role user).

```text
GET    /api/v1/shops            # list (search name/phone/channelName, filter channelType, pagination)
POST   /api/v1/shops            # create (channelType + channelName required)
GET    /api/v1/shops/:id
PATCH  /api/v1/shops/:id
DELETE /api/v1/shops/:id

GET    /api/v1/customers        # list (search name/phone, pagination)
POST   /api/v1/customers        # create (duplicate names allowed)
GET    /api/v1/customers/:id
PATCH  /api/v1/customers/:id
DELETE /api/v1/customers/:id

GET    /api/v1/riders           # list (search name/email/phone, filter isAvailable, pagination)
POST   /api/v1/riders           # create — provisions the users row with a forced RIDER role
GET    /api/v1/riders/:id       # :id here is the backing users.id, not a separate rider id
PATCH  /api/v1/riders/:id       # combined DTO: rider profile + user name/phone/status
DELETE /api/v1/riders/:id       # removes both rider and user rows (self-delete → 400)
```

Shops carry messaging routing (`channelType` = `VIBER` | `TELEGRAM`, `channelName`); the nullable `chatId` is captured by the channel bot in a later phase and is deliberately absent from every DTO. Riders' combined update DTO exists because OFFICER holds `riders.update` but not `users.update` — the 1:1 aggregate stays under one permission. Email, password, and role changes stay ADMIN-only via `/api/v1/users`.

Passwords are hashed with bcrypt; hashes are never exposed in API responses.

## Swagger

```text
/api/v1/docs        Swagger UI
/api/v1/docs-json   Raw OpenAPI specification (OpenAPI 3.0 JSON)
```

`/api/v1/docs-json` is the canonical API contract. The frontend consumes it directly with an OpenAPI code-generation tool to produce its TypeScript API client; no separate OpenAPI file is generated.

## Development Workflow

1. Start infrastructure: `docker compose up -d`
2. Copy `.env.example` to `.env` and configure it.
3. Install dependencies: `pnpm install`
4. Run the API in watch mode: `pnpm start:dev`
5. When business schemas change, generate and apply migrations: `pnpm db:generate` + `pnpm db:migrate`
6. Verify health at `/api/v1/health` and the API contract at `/api/v1/docs-json`.

Quality checks:

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## Project Structure

```text
src/
├── common/
│   ├── auth/                # shared JWT auth + RBAC (global guards, decorators, seeded keys)
│   │   ├── auth.guard.ts    # global JwtAuthGuard (validates token, loads active user)
│   │   ├── permissions.guard.ts
│   │   ├── permission-keys.ts   # seeded permission keys (PERMISSION_KEYS / PermissionKey)
│   │   └── *.decorator.ts   # @Public(), @RequirePermissions(), @CurrentUser()
│   ├── database/            # global Drizzle/PostgreSQL module
│   │   ├── schema.ts        # central schema import point for business tables
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── health/              # /api/v1/health endpoint
│   │   ├── health.module.ts
│   │   ├── health.controller.ts
│   │   └── health.service.ts
│   └── utils/               # password hashing helpers
├── auth/                    # login, me, change-password (issues JWT)
├── users/                   # user schema + admin CRUD
├── shops/                   # shop schema + CRUD (messaging channel routing)
├── customers/               # customer schema + CRUD (flat, dup names allowed)
├── riders/                  # rider profile 1:1 with a RIDER-role user (transactional CRUD)
├── roles/                   # dynamic role CRUD (is_system, userCount)
├── permissions/             # permission catalog CRUD + role grants
├── config/                  # environment validation
├── setup-app.ts             # shared app configuration (prefix, versioning, pipes, CORS, Swagger)
├── app.module.ts
└── main.ts
```

`src/common/` holds cross-cutting infrastructure shared by every feature. Feature modules follow a dedicated folder per domain (and their own submodules/controllers/services/DTOs), importing schema tables through `src/common/database/schema.ts`:

```text
src/
├── auth/
├── users/
├── shops/
├── customers/
├── riders/
├── orders/
├── pickups/
├── deliveries/
├── returns/
├── payments/
├── notifications/
├── integrations/
├── reports/
└── common/
```

## Phase Roadmap

- [x] **Foundation** — app/API infra, Drizzle pipeline, Swagger, health, Docker dev environment
- [x] **Phase 1 — Users + Auth + RBAC** — JWT login, fixed module×action RBAC catalog (roles/permissions/role_permissions), user CRUD, OWNER seed
- [x] **Phase 2 — Master Data** — shops (messaging channel fields), customers, riders (1:1 with `RIDER`-role users); CRUD + search/filter/pagination for all three
- [ ] Phase 3 — Orders core (state machine)
- [ ] Phase 4 — Pickups
- [ ] Phase 5 — Deliveries
- [ ] Phase 6 — Returns + payment reconciliation
- [ ] Phase 7 — Notifications + Viber
- [ ] Phase 8 — Reports