# Delivery Management API — Build Plan

What's next after Foundation + Phase 1 (Users/ Auth/ RBAC). Each phase lands against a working, migrated schema behind `/api/v1`, with the global auth guard, explicit permissions, OpenAPI-accurate response DTOs, and the full quality gate (`lint`, `build`, `test`, `test:e2e`).

Legend: ✅ done · phase-relative commit (migration + code + tests together).

## Ground rules for every phase

- Add a Drizzle migration via `pnpm db:generate` and verify `pnpm db:migrate` on a clean state before/after.
- Re-export every new table from `src/common/database/schema.ts` or `db:generate` won't see it.
- Every new protected route needs `@RequirePermissions(...)` **and** its roles entry in `src/common/auth/permissions.ts`. Proposed keys below — confirm against the real role needs before adding.
- Business tables get `id uuid default gen_random_uuid()`, `created_at`/`updated_at` timestamptz (drizzle defaults), matching `users`.
- Never expose `password_hash`; riders/users link via `users.id` (RIDER role), not copied credentials.

---

## Phase 2 — Master Data (shops, customers, riders)

Reference data for everything downstream.

- **Tables**: `shops`, `customers` (standalone, not auth users), `riders` (1:1 with `users` where `role='RIDER'`).
- **Endpoints** (CRUD + list/search/filter):
  - `/api/v1/shops`, `/api/v1/customers` — OWNER/ADMIN/OFFICER.
  - `/api/v1/riders` — OWNER/ADMIN manage; create rider = create `users` row (`RIDER`) + `riders` row in one transaction.
- **Permissions to add**: `shops.manage|view`, `customers.manage|view`, `riders.manage|view`.
- **Tests**: CRUD + list e2e; rider creation keeps a single source of truth (users) for auth.

---

## Phase 3 — Orders core (the center of everything)

The state machine every later phase drives.

- **Table**: `orders` + `order_status_history` (append-only log).
- **Enums**:
  - `ORDER_STATUS`: `PENDING → PICKED_UP → RECEIVED_AT_OFFICE → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | FAILED | RETURNED`.
  - `PAYMENT_MODE`: `PREPAID | COD | PARTIAL`; `PAYMENT_STATUS`: `UNPAID | PARTIAL | PAID` (kept separate — never derive status from amounts).
- **Fields**: `tracking_code` (unique, generate on register), `customer_id`, `shop_id`, `package_info jsonb` (items/weight/size — room for QR/photo later), `delivery_fee`, `cod_amount`, payment fields, `status`, notes.
- **Endpoints**: `POST /orders` (register, `PENDING`), `GET /orders` (list/filter by status/customer/shop/tracking code), `GET /orders/:id` (with history + current actor), `GET /orders/:id/history`.
- **Design**: `OrderStateService` (exported) owns all transitions with a hard-coded allowed-transition matrix; pickups/deliveries/returns call it instead of writing `order.status` directly. Unit-test the matrix exhaustively.
- **Permissions**: `orders.register`, `orders.read`, `orders.update` — OWNER/ADMIN/OFFICER.
- **Tests**: state-machine table tests; e2e register → history; invalid transitions return 400.

---

## Phase 4 — Pickups

Batch pickup runs that advance `PENDING → PICKED_UP`.

- **Tables**: `pickups` (run: scheduled date, status, notes) + `pickup_orders` (join: pickup ↔ order, N:N).
- **Enums**: `PICKUP_STATUS`: `SCHEDULED → COMPLETED | CANCELLED`.
- **Endpoints**: schedule a pickup with orders; list pickups; complete a pickup (batch-transition its orders to `PICKED_UP` via `OrderStateService`); cancel.
- **Permissions**: `pickups.manage`, `pickups.view`.
- **Tests**: batch transition history rows created per order.

---

## Phase 5 — Delivery ops

`deliveries` rows **are the attempt ledger** — every retry is a NEW `deliveries` row, `FAILED → ASSIGNED` orders get a fresh attempt.

- **Table**: `deliveries` (order_id, rider_id, `DELIVERY_STATUS`, `proof jsonb` — recipient name/photo URL/signature, timestamps for assigned/out/delivered/failed).
- **Enums**: `DELIVERY_STATUS: ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | FAILED`; `FAILURE_REASON` on failed attempts.
- **Endpoints**:
  - Office: assign rider (`orders → ASSIGNED`), view attempt history.
  - Rider self-service: `GET /riders/me/deliveries` (today's assigned/out), claim out-for-delivery, mark `DELIVERED` (store COD collection + proof), mark `FAILED` (reason).
- **Permissions**: `deliveries.assign` (OWNER/ADMIN/OFFICER), `deliveries.self-*` (RIDER — only own assignments; enforce ownership server-side).
- **Tests**: retry creates a new delivery row; COD collected amount recorded at delivery time.

---

## Phase 6 — Returns + payment reconciliation

- **Table**: `returns` (order reference, reason, status, received-at).
- **Enums**: `RETURN_REASON`, `RETURN_STATUS` (returning → received; advances order to `RETURNED`).
- **Table**: `payment_collections` ledger — one row per collected amount (order id, collected by, method, amount, collected-at). Audit trail for COD.
- **Endpoints**: register return, receive return, list returns; `GET /orders/:id/collections`, `POST /collections`, reconciliation report feed (open COD: `PAYMENT_STATUS != PAID`).
- **Permissions**: `returns.manage`, `payments.collect`, `payments.reconcile` (OWNER/ADMIN).
- **Tests**: ledger rows change order `PAYMENT_STATUS` toward `PAID` without amount-derivation.

---

## Phase 7 — Notifications + Viber

Daily operational messages to configured Viber groups **at admin-desired times** (not a hardcoded 07:00).

- **Tables**: `notifications` (send log) + `notification_schedules` (name, send time `HH:MM`, timezone, target groups, ACTIVE/PAUSED, last-fired date).
- **Infra**: `@nestjs/event-emitter` for in-process events; BullMQ (uses the already-provisioned Redis) for scheduling; a repeatable ticker (~every minute) scans ACTIVE schedules due in their timezone and fires once per day per schedule.
- **Provider adapter**: `integrations/` with a `ViberProvider` interface (webhook-based); a no-op logger provider behind a feature flag until real credentials exist.
- **Message content**: daily operational summary generated from live data (today's pickups pending, orders out for delivery, failures awaiting action).
- **Endpoints**: admin CRUD for schedules; notification send log view.
- **Env**: add `APP_TIMEZONE`; keep `VIBER_BOT_TOKEN/GROUP_ID/WEBHOOK_URL` (already in `.env.example`).
- **Permissions**: `notifications.manage`, `notifications.view`.
- **Tests**: schedule due-check logic unit tests (timezone-safe); notification row on simulated send.

---

## Phase 8 — Reports

Read-only aggregates, no new tables.

- **Endpoints**: `/reports/daily` (registered/picked/delivered/failed per day), `/reports/cod-pending` (open COD by shop), `/reports/rider-performance`, `/reports/shop-performance`. Filterable by date range.
- **Permissions**: `reports.read` (OWNER/ADMIN/OFFICER).
- Verify query performance with indexes on `order_status_history.created_at` / `orders.status`.

---

## Cross-cutting notes

- **Module deps stay one-way**: `pickups`, `deliveries`, `returns` depend on `orders` (its `OrderStateService`); never the reverse.
- **Payment two-axis**: `payment_mode` (how) vs `payment_status` (where) never conflated; `payment_collections` is the only place money movement is recorded.
- **Order center**: tracking codes, status history, and the state machine make `orders` the single source of truth the frontend and Viber summaries read from.
- **RIDER visibility**: RIDER accounts see only self-scoped data (assigned deliveries); every RIDER route must re-check row ownership, not just the permission.
- **Test hygiene**: e2e runs against the shared docker Postgres and cleans up after itself; keep using unique emails (`${name}-${Date.now()}@e2e.local`) so parallel runs don't collide.