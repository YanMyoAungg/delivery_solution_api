# Delivery Management API — Build Plan

This plan records the implemented Foundation through Phase 5 and the gated work that follows. Each implementation phase lands against a working, migrated schema behind `/api/v1`, with the global auth guard, explicit permissions, OpenAPI-accurate response DTOs, and the full quality gate (`lint`, `build`, `test`, `test:e2e`).

Legend: ✅ done · phase-relative commit (migration + code + tests together).

## Current Status

- **Foundation:** COMPLETE
- **Phase 1:** COMPLETE
- **Permission catalog:** 13 modules / 68 fixed keys
- **Phase 2 — Master Data:** COMPLETE
- **Phase 3 — Orders Core:** COMPLETE
- **Phase 4 — Pickups:** COMPLETE
- **Phase 5 — Delivery Operations:** COMPLETE
- **Phase 6 — Returns + Payment Reconciliation:** PREFLIGHT BLOCKED; implementation not authorized
- **Next authorized activity:** domain decision approval and ADR drafting only

Known project-state findings:

- The implementation uses a fixed permission catalog from `src/common/auth/permission-keys.ts`; older runtime-permission wording remains in `README.md` and `docs/rbac-system.md` and is documentation debt.
- The permission names below are historical proposals where they differ from the fixed catalog. Implemented routes use fixed catalog keys such as `shops.*`, `pickups.*`, and `deliveries.*`; future Phase 6 permissions require explicit role-mapping approval.
- Returns + Payment Reconciliation is not implementation-ready: no authoritative decisions exist for return eligibility/lifecycle, payment semantics/ledger behavior, reconciliation authority, or operational permission mapping.
- The current order lifecycle is `PENDING → PICKED_UP → RECEIVED_AT_OFFICE → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED`, with `OUT_FOR_DELIVERY → FAILED`, `OUT_FOR_DELIVERY → RETURNED`, and `FAILED → ASSIGNED`. `DELIVERED` and `RETURNED` are terminal. The existing `OUT_FOR_DELIVERY → RETURNED` edge remains unchanged, but no approved Returns workflow invokes it.
- Delivery operations allow a maximum of three attempts. The third failure leaves the order `FAILED`, retry is rejected, and there is currently no automatic return.
- The Phase 6 notes below are historical planning proposals, not approved implementation requirements.
- `pnpm-workspace.yaml` has the intended native build approvals for `esbuild` and `bcrypt`; only the file-ending normalization is incidental in the current worktree.
- `RolesService.create()` does not currently use its caller role id for scope enforcement. Existing ADMIN/user-scope authorization behavior is preserved; no role-management change is part of Phase 2.

## Ground rules for every phase

- Add a Drizzle migration via `pnpm db:generate` and verify `pnpm db:migrate` on a clean state before/after.
- Re-export every new table from `src/common/database/schema.ts` or `db:generate` won't see it.
- Every new protected route needs `@RequirePermissions(...)` and an existing fixed catalog key from `src/common/auth/permission-keys.ts`. Proposed keys below are historical planning notes and must be reconciled before use.
- Business tables get `id uuid default gen_random_uuid()`, `created_at`/`updated_at` timestamptz (drizzle defaults), matching `users`.
- Never expose `password_hash`; riders/users link via `users.id` (RIDER role), not copied credentials.

---

## Phase 2 — Master Data (shops, customers, riders)

Reference data for everything downstream.

- **Tables**: `shops`, `customers` (standalone, not auth users), `riders` (1:1 with `users` where `role='RIDER'`).
- **Endpoints** (CRUD + list/search/filter):
  - `/api/v1/shops`, `/api/v1/customers` — OWNER/ADMIN/OFFICER.
  - `/api/v1/riders` — OWNER/ADMIN manage; create rider = create `users` row (`RIDER`) + `riders` row in one transaction.
- **Historical permission proposal:** `shops.manage|view`, `customers.manage|view`, `riders.manage|view`. The implemented fixed catalog uses module CRUD keys instead.
- **Tests**: CRUD + list e2e; rider creation keeps a single source of truth (users) for auth.

---

## Phase 3 — Orders core (the center of everything)

The state machine every later phase drives.

- **Table**: `orders` + `order_status_history` (append-only log).
- **Enums**:
  - `ORDER_STATUS`: `PENDING → PICKED_UP → RECEIVED_AT_OFFICE → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | FAILED | RETURNED`.
  - **Historical payment proposal only:** `PAYMENT_MODE`: `PREPAID | COD | PARTIAL`; `PAYMENT_STATUS`: `UNPAID | PARTIAL | PAID`. No payment mode/status model is currently implemented or approved.
- **Fields**: `tracking_code` (unique, generate on register), `customer_id`, `shop_id`, `package_info jsonb` (items/weight/size — room for QR/photo later), `delivery_fee`, `cod_amount`, `status`, notes. Payment fields remain unimplemented and require a separate approved domain decision.
- **Endpoints**: `POST /orders` (register, `PENDING`), `GET /orders` (list/filter by status/customer/shop/tracking code), `GET /orders/:id` (with history + current actor), `GET /orders/:id/history`.
- **Design**: `OrderStateService` (exported) owns all transitions with a hard-coded allowed-transition matrix; pickups/deliveries/returns call it instead of writing `order.status` directly. Unit-test the matrix exhaustively.
- **Historical permission proposal:** `orders.register`, `orders.read`, `orders.update`. The implemented catalog uses the existing `orders.create`, `orders.read`, and `orders.update` keys.
- **Tests**: state-machine table tests; e2e register → history; invalid transitions return 400.

---

## Phase 4 — Pickups

Batch pickup runs that advance `PENDING → PICKED_UP`.

- **Tables**: `pickups` (run: scheduled date, status, notes) + `pickup_orders` (join: pickup ↔ order, N:N).
- **Enums**: `PICKUP_STATUS`: `SCHEDULED → COMPLETED | CANCELLED`.
- **Endpoints**: schedule a pickup with orders; list pickups; complete a pickup (batch-transition its orders to `PICKED_UP` via `OrderStateService`); cancel.
- **Historical permission proposal:** `pickups.manage`, `pickups.view`. The implemented catalog uses `pickups.create`, `pickups.read`, and `pickups.update`.
- **Tests**: batch transition history rows created per order.

---

## Phase 5 — Delivery ops

`delivery_attempts` rows are the implemented attempt ledger — every retry is a new row, and `FAILED → ASSIGNED` orders get a fresh attempt.

- **Implemented table:** `delivery_attempts` (order_id, rider_id, `DELIVERY_STATUS`, failure reason/note, and lifecycle timestamps) plus `delivery_attempt_history`. Proof and COD collection are not implemented.
- **Enums**: `DELIVERY_STATUS: ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | FAILED`; `FAILURE_REASON` on failed attempts.
- **Endpoints**:
  - Office: assign rider (`orders → ASSIGNED`), view attempt history.
  - Rider self-service: `GET /riders/me/deliveries` (today's assigned/out), claim out-for-delivery, mark `DELIVERED`, and mark `FAILED` (reason). COD collection and proof are not implemented.
- **Historical permission proposal:** `deliveries.assign` and `deliveries.self-*`. The implemented catalog uses `deliveries.create`, `deliveries.read`, and `deliveries.update`, with rider ownership enforced server-side.
- **Tests**: retry creates a new delivery row; delivery lifecycle and rider ownership are covered. COD collection is deferred.

---

## Phase 6 — Returns + Payment Reconciliation — PREFLIGHT BLOCKED

Implementation is not authorized. No approved Returns, Payment, or Reconciliation schema, service, route, DTO, migration, history model, or workflow exists.

### Pending domain decisions

Returns decisions are required for: entry states; failed-delivery/max-attempt behavior; office receipt requirements; return ownership; lifecycle states/transitions; cancellation/reopening; multiple return records; order-status timing; reason taxonomy; and return idempotency.

Payment decisions are required for: the meaning of `orders.codAmount`; prepaid representation; `PARTIAL` semantics; stored versus derived payment status; collection ownership/timing; partial collection; overpayment; refunds; append-only ledger/correction behavior; and payment idempotency.

Reconciliation decisions are required for: reconciliation subject; authoritative source; read-only versus persistent reconciliation; states; ownership; discrepancy representation; whether discrepancies block operations; rerun behavior; reversal behavior; and query granularity/dimensions.

The fixed catalog already contains `returns.create/read/update/delete/export/import` and `payments.create/read/update/delete/export/import`. These keys are available for consideration, but precise role mapping and operational semantics remain pending approval. No new permission keys are authorized by this plan.

### Candidate invariants — pending domain approval

The following are proposed constraints, not accepted requirements:

- Order status changes remain owned by `OrderStateService`.
- Return history remains distinct from `order_status_history`.
- Return operations use current-state predicates for race protection.
- Return creation/receipt and related order-state changes are atomic if that workflow is approved.
- Operational return history is not deleted.
- Idempotent replay does not create duplicate active returns.
- Monetary movement is append-only if an internal collection ledger is approved.
- Corrections are explicit rather than silent overwrites.
- Payment projection and collection movement are transactionally consistent if that model is approved.
- Payment state is not inferred from `codAmount` alone unless explicitly approved.
- Monetary values use fixed-scale numeric storage.
- Collection operations require idempotency and amount/state validation.
- Read-only reconciliation does not mutate authoritative transaction history.
- Persistent reconciliation, if approved, has explicit state, discrepancy, and audit semantics.
- Reconciliation reruns are safe and immutable collection history is not silently rewritten.

### Explicit deferrals

Unless later approved, the following remain outside scope: automatic return after failed delivery; COD refunds; external payment gateways/webhooks; rider cash handoff; settlement batches; shop payouts; return shipping/provider integration; package inspection/photos; notifications/Viber integration; scheduled reconciliation jobs; reconciliation dashboards/reports beyond an approved first slice; multi-currency; tax/invoice accounting; and external ERP payment synchronization.

### ADR gate

No implementation-authorizing ADR exists. An ADR is required after the domain decisions above are explicitly approved. Any draft must distinguish `proposed`, `pending decision`, and `accepted`; unresolved Returns/Payment/Reconciliation decisions must not be marked accepted.

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
- **Historical payment proposal, not an approved invariant:** `payment_mode` (how) vs `payment_status` (where) should not be conflated; a `payment_collections` ledger would be the money-movement source if approved.
- **Order center**: tracking codes, status history, and the state machine make `orders` the single source of truth the frontend and Viber summaries read from.
- **RIDER visibility**: RIDER accounts see only self-scoped data (assigned deliveries); every RIDER route must re-check row ownership, not just the permission.
- **Test hygiene**: e2e runs against the shared docker Postgres and cleans up after itself; keep using unique emails (`${name}-${Date.now()}@e2e.local`) so parallel runs don't collide.
