# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NestJS 12 (Express) + TypeScript API for a single delivery company's operations: shops, customers, riders, orders, pickups, deliveries, returns, payments/COD, notifications. Postgres 18/Drizzle ORM, Redis (future jobs), Swagger, Vitest. Single package, pnpm workspaces, ESM under `nodenext`. Nothing committed yet — only commit/push when the user explicitly asks.

Phase status (roadmap in `README.md` / `PLAN.md`): Foundation ✅, Phase 1 (Users/Auth/RBAC) ✅. Phases 2–8 (shops/customers/riders → orders → pickups → deliveries → returns/COD → notifications → reports) land as `src/<domain>/` modules.

## Skills — invoke before task-specific code

Check this table at the start of every task; if a row matches, invoke the skill **before** writing code. Multiple can apply; each applies regardless of change size.

| Task touches | Invoke |
|---|---|
| Any frontend/UI work (dashboards, forms, CRUD screens, components, responsive layout) | `ui-ux-pro-max` |
| Landing/marketing pages, visual polish, aesthetic direction, redesigns | `taste` (aesthetic, on top of `ui-ux-pro-max`) |
| Charts, graphs, KPI tiles, data visualization, analytics dashboards | `dataviz` (before first chart line) |
| Logos, banners, pitch decks, icon sets, brand/social assets | `ui-ux-pro-max:design` |
| Library/framework/SDK/CLI docs question | `ctx7` CLI (see `~/.claude/rules/context7.md`) |
| Code review / quality pass on changes | `code-review` |

Utility-only work (pure API/backend/config) → no frontend skill needed. If unsure, invoke — an unneeded skill costs little.

## Type safety / code quality (mandatory)

- **No `any`** — this is the project's core quality bar. Type everything: DTOs for every request/response, explicit return types, `unknown` at trust boundaries instead of `any`. `@typescript-eslint/no-explicit-any` is on (recommended set) — keep it there.
- No `@ts-ignore` / `@ts-expect-error` / bare non-null assertions (`!`) to silence the compiler. If codegen (CodeGen docs) or a DB driver must be cast, prefer `unknown` → narrow → type-guard (e.g. `isUniqueViolation`) over `as any`.
- `strict` is on in `tsconfig.json` — preserved for all new code. Use `satisfies` for const arrays constrained to a broader type.
- Drizzle: `.$inferSelect`/`.$inferInsert` for row shapes, never loose `Record<string, unknown>` return types from services (resulting swagger clients are thin).

## Naming conventions (mandatory)

- **No abbreviations.** Full words: `permission`/`permissions`, not `p`/`perm`; `role` not `r`; `user` not `u`; `description` not `desc`. Single-letter names only for loop indexes / SQL aliases.
- **Files** — kebab-case + typed suffix: `users.service.ts`, `permissions.controller.ts`, `role-permissions.schema.ts`, `permission-keys.ts`, `create-user.dto.ts`, `permissions.module.ts`. Tests: `*.spec.ts`, `*.e2e-spec.ts`.
- **Classes / DTOs** — PascalCase, suffix the kind: `PermissionService`, `RolesController`, `LoginResponseDto`, `UserStatus`.
- **Functions & methods** — camelCase, verb-first: `getEffectivePermissions`, `setRoleGrants`, `createPermission`, `roleOrThrow`.
- **Variables** — camelCase, descriptive; prefer `permissions` (array), `role` (single), `user` over short names.
- **Constants** — UPPER_SNAKE_CASE: `CACHE_TTL_MS`, `NAME_PATTERN`, `PERMISSION_KEYS`.
- **Booleans** — `is`/`has`/`can` prefix: `isSystem`, `hasPermission`, `canAssign`.
- **Types & type aliases** — PascalCase, singular: `PermissionKey`, `UserStatus`. DB rows via `.$inferSelect`.
- **DB schema** — tables/columns `snake_case` (`is_system`, `role_id`, `created_at`); Drizzle field names camelCase mirrors of the column.

## Commands

```bash
pnpm install
cp .env.example .env
docker compose up -d

pnpm start:dev     # watch-mode server on :3000; auto-runs migrations on bootstrap
```

Quality gate (run all four before considering work done):

```bash
pnpm lint        # ESLint flat config, src + test
pnpm build       # nest build -> dist/
pnpm test        # Vitest unit (**/*.spec.ts) — mocked DB, no containers
pnpm test:e2e    # Vitest e2e (test/*.e2e-spec.ts) — hits the REAL docker Postgres
```

Single test file / filter: `pnpm test -- <path>` (e.g. `pnpm test -- src/users/users.service.spec.ts`), or `pnpm test -- -t "<name fragment>"`.

Database scripts:

```bash
pnpm db:generate   # Drizzle migration from schemas
pnpm db:migrate    # apply migrations
pnpm db:seed       # idempotent seed (OWNER + 2 admins; SEED_OWNER_* env override)
pnpm db:studio     # Drizzle Studio
pnpm db:reset      # DROP ALL → migrate → seed (clean slate)
```

e2e requires `docker compose up -d` (Postgres publishes on host port from `DB_PORT`); it writes to the shared dev DB and cleans up — never run e2e against a DB you care about. e2e uses unique emails (`${name}-${Date.now()}@e2e.local`) so parallel runs don't collide.

## Environment (easy to get wrong)

- `.env` (gitignored) intentionally differs from `.env.example`: local Postgres publishes on host port **5433**, the example uses **5432**. Never overwrite `.env` from `.env.example`. If local Postgres already uses 5432, set `DB_PORT`/`DATABASE_URL` to 5433 in `.env`.
- App never reads `process.env` directly — everything flows through `@nestjs/config` validated in `src/config/env.validation.ts` (fails boot if `DATABASE_URL` or `JWT_SECRET` missing). `drizzle.config.ts` reads `DATABASE_URL` itself.
- `.env.local` is loaded *before* `.env` (both read by ConfigModule and drizzle).

## Architecture

- **Wiring** (`src/main.ts` → `setup-app.ts`): global prefix `/api`, URI versioning `v1`, global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform). All routes live under `/api/v1/...`. Swagger mounted at `/api/v1/docs`; `/api/v1/docs-json` is the canonical OpenAPI contract the frontend code-gens its TypeScript client from.
- **`src/app.module.ts`** registers two global guards (`APP_GUARD` order matters): `JwtAuthGuard` then `PermissionsGuard`. Every route requires a `Bearer` JWT unless marked `@Public()`.
- **`src/common/`** — cross-cutting infra shared by all domains:
  - `database/` — global Drizzle/Postgres `DatabaseService`; `schema.ts` is the central re-export point and the ONLY schema imports `db:generate` sees.
  - `auth/` — global guards, decorators (`@Public()`, `@RequirePermissions()`, `@CurrentUser()`), and `permissions.ts` (permission→roles matrix).
  - `health/` — public probe (`GET /api/v1/health`).
- **Feature modules** (`src/auth/`, `src/users/`, future `src/shops/` etc.) each own controller/service/DTOs + a `*.schema.ts` + a `*.module.ts`.

## Conventions that differ from Nest defaults

- **ESM `nodenext`**: relative imports MUST end in `.js` (`import { users } from '../../users/user.schema.js'`). Missing extension = tsc build error.
- **Route guard** (from `src/common/auth/auth.guard.ts`): token's `sub` must match an active user; guard rebuilds the user from DB — don't keep stale copies of `req.user`.
- **RBAC is dynamic** (spatie-style, three tables `roles`/`permissions`/`role_permissions` + `users.role_id`): OWNER/ADMIN manage roles, permission keys, and per-role grants from the API/UI — no code changes. `src/common/auth/permission-keys.ts` holds the 14 seeded keys (`PermissionKey` type) + `PERMISSION_KEYS` for auth autocomplete; **new keys are created at runtime**, do NOT hardcode more.
  - `is_system` roles (OWNER) bypass grant rows entirely (shortcircuit in `PermissionService.getEffectivePermissions`) — never grant rows for OWNER.
  - Scope: caller can only grant a subset of its own effective permissions; no self-modification; ADMIN cannot touch OWNER/ADMIN. `@RequirePermissions('x.y')` **fails closed** for unknown keys.
  - `permissions.name` format `domain.action` (lowercase); `roles.name` UPPER_CASE, immutable after create; delete-role blocked while `userCount > 0`, delete-key blocked while granted.
- **Never expose `passwordHash`/`password_hash`** in any response; passwords hashed with bcrypt (`src/common/utils/password.util.ts`). Auth is access-token only; `POST /api/v1/auth/login` → JWT in `Authorization: Bearer`; route guards rebuild the user from DB — token `sub` must match an active user.
- Controllers use `@Controller({ path: 'x', version: '1' })`.
- OpenAPI is generated, not hand-written: response DTOs need correct `@Api*Response({ type })` or the frontend client (generated from `/api/v1/docs-json`) is wrong.
- Drizzle tables live with their feature module; every NEW table MUST be re-exported from `src/common/database/schema.ts` (`export * from '../../<module>/<name>.schema.js'`) or `db:generate` silently won't see it. Business tables use `id uuid default gen_random_uuid()` + `created_at`/`updated_at` timestamptz (drizzle defaults), matching `users`.

## Migrations gotchas (hard-earned)

- Migrations auto-apply on every `start:dev` bootstrap AND via `db:migrate`. A running dev server will apply freshly generated migrations — stop it (`kill $(pgrep -f "delivery_solution/d_api")`) before resetting schema state.
- Drizzle bookkeeping lives in the Postgres **`drizzle`** schema (`drizzle.__drizzle_migrations`), not `public`. Don't delete `drizzle/meta/*` or a generated SQL file: a stale journal/snapshot makes `db:migrate` replay SQL and fail with an opaque "already exists". Recovery for the dev DB:
  ```bash
  docker exec d_api-postgres-1 psql -U delivery_user -d delivery_db \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;'
  pnpm db:migrate
  ```
- Inspect state: `docker exec d_api-postgres-1 psql -U delivery_user -d delivery_db -c "\dt"`.

## pnpm native-build approval

`pnpm-workspace.yaml` holds build-script approvals (`bcrypt`, `esbuild`). pnpm blocks postinstall builds — adding an unapproved native dependency makes `pnpm add` AND every `db:*` script fail with `[ERR_PNPM_IGNORED_BUILDS]`. Add the package there and reinstall.