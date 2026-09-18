# AGENTS.md

NestJS 12 (Express) + TypeScript API for a single delivery company's operations. Postgres 18/Drizzle, Redis, Swagger, Vitest. Single package, no monorepo. Only commit/push when the user explicitly asks.

## Skills — invoke before task-specific code

Check the table at the start of every task; if a row matches, invoke the skill before writing code. Multiple can apply.

| Task touches | Invoke |
|---|---|
| Any frontend/UI work (dashboards, forms, CRUD screens, components, layouts) | `ui-ux-pro-max` |
| Landing/marketing pages, visual polish, aesthetic direction | `taste` (on top of `ui-ux-pro-max`) |
| Charts, graphs, KPI tiles, data visualization | `dataviz` (before first chart line) |
| Logos, decks, icon sets, brand/social assets | `ui-ux-pro-max:design` |
| Library/framework/SDK/CLI docs question | `ctx7` CLI (see `~/.claude/rules/context7.md`) |
| Code review / quality pass on changes | `code-review` |

Utility-only work (pure API/backend/config) needs no frontend skill. When unsure, invoke anyway.

## Type safety / code quality (mandatory)

- **No `any`** anywhere. Type everything: DTOs for all request/response shapes, explicit return types, `unknown` at trust boundaries. `@typescript-eslint/no-explicit-any` (recommended set) stays on.
- No `@ts-ignore` / `@ts-expect-error` / bare `!` to silence the compiler. Cast via `unknown` + narrowing + type-guard (e.g. `isUniqueViolation` reading `err.cause.code`) — never `as any`.
- `strict` is on; new code keeps it. Use `satisfies` for const arrays bounded by a broader type.
- Drizzle: `.$inferSelect`/`.$inferInsert` row shapes; never return bare `Record<string, unknown>` from services (thin swagger clients).

## Commands

```bash
pnpm db:generate   # generate Drizzle migration from src/common/database/schema.ts
pnpm db:migrate    # apply migrations
pnpm db:seed       # idempotent seed (OWNER + 2 admins; SEED_OWNER_* env override)
pnpm db:reset      # DROP ALL → migrate → seed (clean slate)
pnpm start:dev     # watch-mode dev server; auto-runs migrations on bootstrap
```

Quality gate (run all four):
```bash
pnpm lint      # ESLint flat config (eslint.config.mjs), src + test
pnpm build     # nest build -> dist/
pnpm test      # Vitest unit (**/*.spec.ts) — mock DB, no containers needed
pnpm test:e2e  # Vitest e2e (test/*.e2e-spec.ts) — hits the REAL docker Postgres
```

e2e requires `docker compose up -d` running (Postgres on host port 5433); it inserts into the shared dev DB and cleans up. Don't run e2e against a DB you care about.

## Environment (easy to get wrong)

- `.env` (gitignored) intentionally **differs from `.env.example`**: local Postgres publishes on host port `5433`; the committed example uses `5432`. Never overwrite `.env` from `.env.example`.
- `drizzle.config.ts` loads `.env.local`/`.env` itself and reads `DATABASE_URL`; `src/config/env.validation.ts` fails boot if `DATABASE_URL` or `JWT_SECRET` are missing.

## Auth / RBAC — affects every new route

- `src/app.module.ts` registers global `APP_GUARD`s (JwtAuthGuard + PermissionsGuard): every route requires a `Bearer` JWT unless marked `@Public()`.
- Protected routes declare `@RequirePermissions('x.y')`; the permission→roles entry must exist in `src/common/auth/permissions.ts` (fail closed for unknown keys).
- Users not in any permission list are "authenticated only" — don't rely on that; annotate explicitly.
- Never return `passwordHash` in any response. Auth is access-token only.

## Code conventions that differ from Nest defaults

- ESM under `nodenext`: relative imports MUST end in `.js` (`import { users } from '../../users/user.schema.js'`). Missing extension = tsc build error.
- Drizzle tables live with their feature module; the central entry `src/common/database/schema.ts` re-exports them (`export * from '../../<module>/<name>.schema.js'`). New tables MUST be re-exported there or `db:generate` silently won't see them.
- Controllers: `@Controller({ path: 'x', version: '1' })` → all routes under `/api/v1/...`.
- OpenAPI is generated, not hand-written: `/api/v1/docs-json` is the canonical contract the frontend code-gens its client from. Give response DTOs proper `@Api*Response({ type })` or the frontend client is wrong.
- Each feature module = `controller/service/dto/*.schema.ts` plus a `*.module.ts` registered in `src/app.module.ts`.

## Migrations gotchas (hard-earned)

- Migrations apply on every `start:dev` bootstrap (DatabaseService.onApplicationBootstrap) AND via `db:migrate`. A running dev server will auto-apply freshly generated migrations — stop it (`kill $(pgrep -f "delivery_solution/d_api")`) before resetting schema state.
- drizzle bookkeeping lives in the Postgres `drizzle` schema (`drizzle.__drizzle_migrations`), not `public`. Don't delete `drizzle/meta/*` or a generated SQL file: stale journal/snapshot makes `db:migrate` replay SQL and fail with an opaque "already exists" (exit 1). Recovery for the dev DB:
  ```bash
  docker exec d_api-postgres-1 psql -U delivery_user -d delivery_db \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;'
  pnpm db:migrate
  ```
- Inspect state with `docker exec d_api-postgres-1 psql -U delivery_user -d delivery_db -c "\dt"`.

## pnpm native-build approval

`pnpm-workspace.yaml` holds build-script approvals (`allowBuilds`/`onlyBuiltDependencies` for `bcrypt`, `esbuild`). pnpm blocks postinstall builds: adding a native dependency without approving it makes `pnpm add` AND every `db:*` script fail with `[ERR_PNPM_IGNORED_BUILDS]`. Add the package there and reinstall.

## Structure

- `src/common/` — cross-cutting: `auth/` (global guards, decorators, seeded permission keys), `database/` (global Drizzle service), `health/` (public probe), `utils/password.util.ts`.
- `src/auth/`, `src/users/` — Phase 1 modules (login/me/change-password; admin user CRUD).
- Phases 2–5 (shops/customers/riders, orders, pickups, deliveries) are implemented under `src/<domain>/`. Phase 6 (returns + reconciliation) is domain-preflight blocked; notifications/Viber and reports remain later phases. The roadmap is at the bottom of README.md.
