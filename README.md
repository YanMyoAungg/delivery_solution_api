# Delivery Management System — Backend API

Backend for a delivery management application serving a single delivery company's operations: shops, customers, riders, townships, orders, and deliveries. Packages are collected outside the system and entered by office staff after arriving at the office; this API does not model pickups. Returns + Payment Reconciliation remains blocked at domain preflight, and daily rider custody is deferred.

## Current Development Status

- **Foundation:** COMPLETE
- **Phase 1:** COMPLETE
- **Permission catalog:** 12 modules / 62 fixed keys
- **Phase 2 — Master Data:** COMPLETE
- **Phase 3 — Orders Core:** SUPERSEDED by the Phase 3.5 lifecycle
- **Phase 3.5 — Townships + round-robin + rider surface:** COMPLETE (backend and frontend)
- **Phase 4 — Pickups:** DELETED; no pickup module/state exists
- **Phase 5 — Delivery Operations:** PARTIAL; assignment, direct complete/fail, and retry are implemented; proof/COD collection remain deferred
- **Phase 3.6 — Daily rider custody:** DEFERRED; shift, sign-out/sign-in, undelivered return, and 5-of-10 classification are not modeled
- **Phase 6 — Returns + Payment Reconciliation:** DOMAIN PREFLIGHT BLOCKED; implementation not authorized
- **Next activity:** resolve Phase 3.6 daily-custody decisions or complete Phase 6 domain preflight before implementing either workflow

Known project-state findings:

- `docs/rbac-system.md` is retained as a historical RBAC design record and is not authoritative for the implemented fixed catalog in `src/common/auth/permission-keys.ts`.
- `PLAN.md` still contains proposed permission names from the earlier design; Shops uses the fixed `shops.*` catalog keys.
- Returns + Payment Reconciliation has no approved table, service, route, DTO, history model, payment ledger, reconciliation model, or implementation authority.
- Current `OrderStatus` and `DeliveryStatus` are `ASSIGNED | DELIVERED | FAILED`; `FAILED → ASSIGNED` retry is capped at three attempts. There is no `PENDING`, `PICKED_UP`, `RECEIVED_AT_OFFICE`, `OUT_FOR_DELIVERY`, `RETURNED`, delivery `start`, or `startedAt`.
- Delivery attempts are limited to three; the third failure leaves the order `FAILED`, retry is rejected, and there is no automatic return.
- The Phase 6 planning notes are proposals only until the listed return, payment, reconciliation, and permission decisions are explicitly approved.
- Current quality gate: 73 unit tests and 66 e2e tests pass with the required environment variables and seeded disposable database.
- `RolesService.create()` accepts the caller role id but does not use it for a scope check. Existing role-management behavior is intentionally unchanged for Phase 2; current ADMIN/user-scope authorization tests pass.
- `APP_TIMEZONE` defaults to `Asia/Yangon` and controls rider board/dashboard date boundaries.

## Current Order Intake and Rider Flow

- A separate collector brings packages to the office. Office staff create an order after it arrives; the collector's pickup journey is outside this system.
- `POST /api/v1/orders` requires a township. The API rejects a township with no active covering rider, then assigns the next rider in that township's round-robin rotation in the same transaction as the order and first delivery attempt.
- The per-township cursor is stored in `township_rotation`; rider coverage is stored in `rider_townships`.
- Orders begin at `ASSIGNED` and transition to `DELIVERED` or `FAILED`. Riders do not claim or start deliveries; complete/fail acts directly on their assigned attempt.
- `GET /api/v1/rider/board` and `/api/v1/rider/dashboard` require `deliveries.read` and derive the rider from the JWT. The board returns own orders in full and redacts other riders' orders to routing context. Riders must not receive `orders.read`.
- Office order/delivery history uses `orders.read`; office reassign uses `orders.update`. Phase 3.6 custody and Phase 6 returns/payment reconciliation are separate deferred workflows.

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

RBAC uses a fixed, seeded module/action catalog with dynamic role grants (`roles`, `permissions`, `role_permissions`, `users.role_id`). OWNER/ADMIN manage role grants, but permission keys are code-defined and read-only at runtime. Seeded roles:

| Role    | Scope |
|---------|-------|
| `OWNER` | System role (`is_system=true`) — holds every permission, cannot be deactivated/deleted via API |
| `ADMIN` | Office administration |
| `OFFICER` | Order, township, and delivery operations |
| `RIDER` | Self-scoped rider board and own delivery actions (`deliveries.read/update`; no `orders.read`) |

Authorization runs through the global `PermissionsGuard` + `@RequirePermissions(...)` decorator; effective permissions come from the role's grant rows (system roles short-circuit to the full catalog). The fixed catalog lives in `src/common/auth/permission-keys.ts` (`PERMISSION_KEYS`/`PermissionKey`); routes without `@RequirePermissions` allow any authenticated user. New permission keys are code changes followed by re-seeding, not runtime-created records.

```text
GET    /api/v1/users            # list users (search, filters, pagination)
POST   /api/v1/users            # create user
GET    /api/v1/users/:id        # get user
PATCH  /api/v1/users/:id        # update user (profile, role, status, password reset)
DELETE /api/v1/users/:id        # delete user
```

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
├── townships/
├── orders/
├── deliveries/
└── common/
```

Returns, payments/reconciliation, notifications/Viber, and reports are later phases; their planning sections do not imply that those modules exist in the current source tree.

## Phase Roadmap

- [x] **Foundation** — app/API infra, Drizzle pipeline, Swagger, health, Docker dev environment
- [x] **Phase 1 — Users + Auth + RBAC** — JWT login, fixed permission catalog with dynamic role grants, user CRUD, OWNER seed
- [x] **Phase 2 — Master Data (shops, customers, riders)**
- [x] Phase 3.5 — Townships, round-robin assignment, rider board/dashboard
- [x] Phase 4 — Pickups deleted (package collection/intake is out of system)
- [ ] Phase 3.6 — Daily rider custody (deferred)
- [x] Phase 5 — Delivery operations core (direct complete/fail, retry; proof/COD collection deferred)
- [ ] Phase 6 — Returns + payment reconciliation
- [ ] Phase 7 — Notifications + Viber
- [ ] Phase 8 — Reports
