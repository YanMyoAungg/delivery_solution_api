# Delivery Management API — Build Plan

This plan records the implemented Foundation through Phase 5 and the gated work that follows. Each implementation phase lands against a working, migrated schema behind `/api/v1`, with the global auth guard, explicit permissions, OpenAPI-accurate response DTOs, and the full quality gate (`lint`, `build`, `test`, `test:e2e`).

Legend: ✅ done · phase-relative commit (migration + code + tests together).

## Current Status

- **Foundation:** COMPLETE
- **Phase 1:** COMPLETE
- **Permission catalog:** **12 modules / 62 fixed keys** after deleting `pickups.*` in Phase 3.5 (was 13 modules / 68 keys).
- **Phase 2 — Master Data:** COMPLETE
- **Phase 3 — Orders Core:** SUPERSEDED by the implemented Phase 3.5 lifecycle
- **Phase 4 — Pickups:** **DELETED OUTRIGHT** — there is no pickup state left in the operational flow, so there is nothing for the module to drive. Deletion includes the module, both tables, the `pickups.*` permission keys, and its e2e coverage. This is not "retired but parked."
- **Phase 5 — Delivery Operations:** PARTIAL — self-scoped rider actions and active-attempt uniqueness remain; assignment now uses system round-robin and `start` is removed.
- **Phase 6 — Returns + Payment Reconciliation:** PREFLIGHT BLOCKED; implementation not authorized
- **Phase 3.6 — Daily rider custody:** DEFERRED, not authorized. See §Phase 3.6.
- **Phase 3.5 — Townships + round-robin:** COMPLETE (backend and frontend). Frontend contract/implementation record: `../d_frontend/BACKEND_PHASE_3_5_HANDOFF.md`.
- **Next activity:** domain decisions only. Phase 6 remains preflight-blocked; Phase 3.6 daily custody remains deferred pending client decisions. Master-data reconciliation (Part A) is complete and applied as migration `0012`.

Known project-state findings:

- The implementation uses a fixed permission catalog from `src/common/auth/permission-keys.ts`; older runtime-permission wording remains in `README.md` and `docs/rbac-system.md` and is documentation debt.
- The permission names below are historical proposals where they differ from the fixed catalog. Implemented routes use fixed catalog keys such as `shops.*`, `riders.*`, and `deliveries.*`; future Phase 6 permissions require explicit role-mapping approval.
- Returns + Payment Reconciliation is not implementation-ready: no authoritative decisions exist for return eligibility/lifecycle, payment semantics/ledger behavior, reconciliation authority, or operational permission mapping.
- **Current order lifecycle:** `ASSIGNED → DELIVERED | FAILED` with a `FAILED → ASSIGNED` retry edge. The pre-3.5 lifecycle (`PENDING → PICKED_UP → RECEIVED_AT_OFFICE → ASSIGNED → OUT_FOR_DELIVERY → …`) was pickup-era and did not describe how packages enter this system.
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

The state machine every later phase drives. **Superseded by Phase 3.5** — kept here for the record.

- **Table**: `orders` + `order_status_history` (append-only log).
- **Enums**:
  - `ORDER_STATUS`: `PENDING → PICKED_UP → RECEIVED_AT_OFFICE → ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | FAILED | RETURNED`.
  - **Historical payment proposal only:** `PAYMENT_MODE`: `PREPAID | COD | PARTIAL`; `PAYMENT_STATUS`: `UNPAID | PARTIAL | PAID`. No payment mode/status model is currently implemented or approved.
- **Fields**: `tracking_code` (unique, generate on register), `customer_id`, `shop_id`, `package_info jsonb` (items/weight/size — room for QR/photo later), `delivery_fee`, `cod_amount`, `status`, notes. Payment fields remain unimplemented and require a separate approved domain decision.
- **Endpoints**: `POST /orders` (register, `PENDING`), `GET /orders` (list/filter by status/customer/shop/tracking code), `GET /orders/:id` (with history + current actor), `GET /orders/:id/history`.
- **Design**: `OrderStateService` (exported) owns all transitions with a hard-coded allowed-transition matrix; deliveries call it instead of writing `order.status` directly. Unit-test the matrix exhaustively.
- **Historical permission proposal:** `orders.register`, `orders.read`, `orders.update`. The implemented catalog uses the existing `orders.create`, `orders.read`, and `orders.update` keys.
- **Tests**: state-machine table tests; e2e register → history; invalid transitions return 400.

---

## Phase 4 — Pickups — **DELETED**

Batch pickup runs that advanced `PENDING → PICKED_UP`. There is no longer any pickup state to advance, so this module is removed entirely rather than retired.

**Operational fact that removes it:** parcels are collected from customers by a separate collector and brought to the office. Office staff then **manually insert** each package into the system. That insert is the intake event and it immediately assigns a rider. There is no scheduled pickup run, no batch scan, and no `PICKED_UP` state in this system.

- Delete `src/pickups/` — controller, service, module, DTOs, and `pickups.service.spec.ts`.
- Drop the `pickups` and `pickup_orders` tables.
- Remove `PickupsModule` from `src/app.module.ts` and both tables from `src/common/database/schema.ts`.
- Remove the `pickups: ['create','read','update','delete','export','import']` entry from `MODULE_ACTIONS` in `src/common/auth/permission-keys.ts`.
- `test/pickups-deliveries.e2e-spec.ts` keeps its delivery half, loses the pickup half.

---

## Phase 5 — Delivery ops

`delivery_attempts` rows are the implemented attempt ledger — every retry is a new row, and `FAILED → ASSIGNED` orders get a fresh attempt.

- **Implemented table:** `delivery_attempts` (order_id, rider_id, `DELIVERY_STATUS`, failure reason/note, and lifecycle timestamps) plus `delivery_attempt_history`. Proof and COD collection are not implemented.
- **Enums**: `DELIVERY_STATUS: ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | FAILED`; `FAILURE_REASON` on failed attempts. **Both are shrunk in Phase 3.5** — see §3.5.2.
- **Endpoints**:
  - Office: assign rider (`orders → ASSIGNED`), view attempt history.
  - Rider self-service: `GET /riders/me/deliveries`, mark `DELIVERED`, mark `FAILED` (reason). COD collection and proof are not implemented.
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
- **Message content**: daily operational summary generated from live data (orders created, assigned, delivered, failures awaiting action).
- **Endpoints**: admin CRUD for schedules; notification send log view.
- **Env**: add `APP_TIMEZONE`; keep `VIBER_BOT_TOKEN/GROUP_ID/WEBHOOK_URL` (already in `.env.example`).
- **Permissions**: `notifications.manage`, `notifications.view`.
- **Tests**: schedule due-check logic unit tests (timezone-safe); notification row on simulated send.

---

## Phase 8 — Reports

Read-only aggregates, no new tables.

- **Endpoints**: `/reports/daily` (created/assigned/delivered/failed per day), `/reports/cod-pending` (open COD by shop), `/reports/rider-performance`, `/reports/shop-performance`. Filterable by date range.
- **Permissions**: `reports.read` (OWNER/ADMIN/OFFICER).
- Verify query performance with indexes on `order_status_history.created_at` / `orders.status`.

---

## Cross-cutting notes

- **Module deps stay one-way**: `deliveries` and (later) `returns` depend on `orders` (its `OrderStateService`); never the reverse.
- **Historical payment proposal, not an approved invariant:** `payment_mode` (how) vs `payment_status` (where) should not be conflated; a `payment_collections` ledger would be the money-movement source if approved.
- **Order center**: tracking codes, status history, and the state machine make `orders` the single source of truth the frontend and Viber summaries read from.
- **RIDER visibility**: RIDER accounts see only self-scoped data. Every RIDER route must re-check row ownership, not just the permission.
- **Test hygiene**: e2e runs against the shared docker Postgres and cleans up after itself; keep using unique emails (`${name}-${Date.now()}@e2e.local`) so parallel runs don't collide.

---

## Phase 2 Reconciliation + Phase 3.5 (2026-09-28)

### Why this section exists

Two independent implementations of Phase 2 (shops, customers, riders) exist. Main carries the second; the first was never merged, and the frontend was built against the first. Separately, a business-rules review has invalidated parts of the *second* implementation — the order lifecycle and the whole delivery-assignment model.

This section covers both: port the dropped master-data fields from the first implementation, then reshape orders/deliveries around townships and system round-robin assignment.

```
6ffea6c7  RBAC catalog fix ──┐
40b8518f  Phase 2 master data (shops/customers/riders)   ← never merged
                           ├─ a6f50381  Merge PR#1 (merged only the RBAC commit)
                           │
8449a413  feat: shops phase 2         ← second, independent implementation
63e15b2e  feat: customers phase 2
472f031d  feat: riders phase 2
9b73c61e  feat: orders phase 2
e694bb7b  feat: pickup delivery workflow
1ae61e17  docs
                           └─ 5c1462d7  Merge PR#2   ← current main
```

PR#1 merged only the RBAC commit off `rbac-fixed-catalog`; `40b8518f` was left stranded. PR#2 was therefore written without ever seeing the shop-channel and rider-licensing design — it did not forget them, it never had them.

`40b8518f` is protected by tag **`rescue/phase2-original`** (pushed to origin). That tag is the durable reference.

### Confirmed business model

- Parcels are collected from customers by a **separate collector** and **brought to the office**. This journey is outside the system.
- **Office staff manually insert each package** once it is physically at the office. That insert is the intake event.
- On insert, the order is attached to a **township** and a rider is **assigned automatically by round-robin within that township**. There is no unassigned window and no rider-initiated claim.
- Round-robin is **per township** — each township keeps its own rotation, so a rider covering two townships does not starve either.
- A township with **no active rider covering it is not orderable**: the office UI disables it, and the API rejects a direct call with 400. An order with no rider is never created.
- An order is **visible to every rider covering that township**, not only the assigned rider. Riders may look back over previous days, not just today.
- Riders are multi-order: one rider holds many concurrent deliveries.
- A rider's only surface is a **dedicated dashboard**, not the office orders page.
- A rider **does not** press "start delivery". Once assigned, the rider delivers; there is no intermediate trigger the office cares about.

```
ASSIGNED → DELIVERED
         → FAILED → ASSIGNED (retry, max 3 attempts)
```

### What the second implementation got right — keep

- **Rider identity**: separate `id` PK + `userId` with `riders_user_unique`. Stable id, 1:1 enforced in the DB. **Do not revert to `userId`-as-PK.**
- **Self-scoped delivery actions**: `complete` and `fail` call `assertOwnership(attempt, userId)`. The rider-facing pattern is already correct.
- **`delivery_attempts_one_active_order_unique`**: unique partial index on `orderId` where the attempt status is the active value. This guarantees **one active attempt per order** at the database level, which the office `reassign` and `retry` paths both depend on. The predicate narrows to a single value in 3.5 (`status = 'ASSIGNED'`).
- **Self-service rider ordering already exists** as `GET /riders/me/deliveries`.

### Decision record

1. `channelType` + `channelName` — restore as-is onto the new shops schema. **Done (Part A).**
2. `shops.chatId` — **deferred** to Phase 7 (notifications). Never expose it; the bot webhook writes it. **Confirmed not added.**
3. `shops.notes` — restore. **Done (Part A).**
4. Rider licensing — restore all six: `vehicleType`, `vehiclePlate`, `licenseNo`, `nrcNumber`, `emergencyContactPhone`, `notes`. **Done (Part A).**
5. Rider identity — keep the new `id` PK. Frontend re-keys from `userId` to `id`.
6. **`is_available` — dropped, not restored.** A rider holds many concurrent orders, so a boolean available/unavailable is meaningless. `users.status` covers "rider on leave" (cannot log in). **The off-switch is removing a rider from a township** — that removes pool access with no extra column.
7. `customers.notes` — **restored** (Part A). The re-implementation dropped it, but the frontend form submits it; dropping the column silently discards the user's input.
8. **`PENDING`, `PICKED_UP`, `RECEIVED_AT_OFFICE`, `OUT_FOR_DELIVERY`, and `RETURNED` are all removed from `OrderStatus`.** `ASSIGNED` is the head state and the column default. Intake is the office insert; the moment an order exists it is already assigned.
9. **`RETURNED` is dropped as unreachable.** Its only inbound transition was `OUT_FOR_DELIVERY → RETURNED`, and `OUT_FOR_DELIVERY` no longer exists. A state with no way to reach it is dead weight. **Phase 6 re-adds it when Returns is actually approved**, and §Phase 3.6 will need a *different*, unambiguous name for the client's undelivered-return concept.
10. **Phase 4 (pickups) is deleted outright** — module, both tables, the `pickups.*` permission keys, and its e2e coverage. There is no pickup state left to drive it. Not "retired but parked."
11. **Assignment is system round-robin**, not rider self-service claiming and not office dispatch. Office `assign`/`reassign` survive as **overrides**, not as the normal path.
12. **No claim endpoint.** `POST /rider-queue/:orderId/claim` is not built, and no `deliveries.claim` permission key is added. The `rider-queue` concept disappears with it.
13. **`POST /deliveries/:id/start` is deleted**, along with the `STARTED` history event and `delivery_attempts.startedAt`. The two existing `inArray(status, ['ASSIGNED','OUT_FOR_DELIVERY'])` predicates in `deliveries.service.ts` narrow to a single active value.
14. **Rider board PII — option B.** A rider sees their own orders in full; other riders' orders in their township are redacted to routing context only. Redaction is applied in the service layer so a query parameter cannot bypass it.
15. **`township_rotation` is its own table**, not a column on `townships`.

---

## Part A — Master data reconciliation — **DONE (2026-09-28)**

Shipped as migration `0012_ancient_may_parker`. Additive only; nothing was dropped from the
current implementation.

**Delivered:** `shops` 6→9 columns, `customers` 6→7, `riders` 4→10. `chatId` correctly
**not** added (deferred to Phase 7); `isAvailable` correctly **not** added (decision 6).

**Gate:** lint clean · build clean · 72/72 unit · 69/69 e2e (up from 66 — three new tests).

**Two findings worth carrying forward:**

1. **A vacuous test caught mid-implementation.** The first version of the channel-validation
   test omitted *both* `channelType` and `channelName` in one case, so the 400 came from
   `channelName`'s `@IsNotEmpty` and the `channelType` rule was never actually exercised.
   A mutation test (adding `@IsOptional()` to `channelType`) still passed — proof the test
   could not fail. Rewritten so each case omits exactly one required field; the same
   mutation now correctly fails that test. **Mutation-test new validation cases.**
2. **`RiderJoinedRow` is a manual mirror of a three-way join**, duplicated across the type
   declaration, the `list` select, and the `riderOrThrow` select. Adding the six fields
   meant three identical edits. When Phase 3.5 adds township coverage this becomes a fourth
   column to duplicate; consider deriving it from a shared select object.

**A1 — Shops: restore channel fields + `notes`**
- `src/shops/shop.schema.ts`: add `shopChannelTypeEnum = pgEnum('shop_channel_type', ['VIBER','TELEGRAM'])`, then `channelType` (`.notNull()`), `channelName` (`.notNull()`), `notes` (nullable), plus `index('shops_channel_type_idx')`.
- `create-shop.dto.ts`: `channelType` via `@IsEnum(SHOP_CHANNEL_TYPES)`, `channelName` via `@IsNotEmpty()`, `notes` optional. `update-shop.dto.ts` inherits all three through `PartialType`.
- `shop-response.dto.ts`: all three, with `@ApiProperty`.
- `shops.service.ts`: `toShopResponse` (line 17), `create` (74-78), `update` (94-97) follow the existing `dto.x !== undefined && { x: dto.x }` idiom.
- `.notNull()` is safe now (`shops` is empty). A populated prod DB would need a backfill — noted, not built.

**A2 — Riders: restore the six licensing fields**
- `rider.schema.ts`: `riderVehicleTypeEnum = pgEnum('rider_vehicle_type', ['BIKE','MOTORBIKE','CAR','OTHER'])`, `vehicleType` (`.notNull().default('BIKE')`), `vehiclePlate`, `licenseNo`, `nrcNumber`, `emergencyContactPhone`, `notes` (all nullable text).
- `CreateRiderDto` / `UpdateRiderDto` / `RiderResponseDto` each gain the six. `vehicleType` optional on create — the column default covers it.
- `riders.service.ts`: `RiderJoinedRow` (line 20), `toRiderResponse` (line 31), and the insert / `.set({...})` sites.

**A3 — No derived availability field.** Superseded by decision 6. Nothing to build.

**A4 — Migrations + permissions**
- `pnpm db:generate` then `pnpm db:migrate`. Stop any dev server first — `DatabaseService.onApplicationBootstrap` auto-applies and will race you.
- Confirm `shops` / `riders` are still re-exported from `src/common/database/schema.ts` or `db:generate` silently skips them.
- **No new permission keys** for Part A.

**A5 — Tests + gate** — all pass.
- `shops.service.spec.ts`: `baseShop` fixture + the exact-`values()` assertions extended.
- `shops.e2e-spec.ts`: round-trips all three fields; asserts `chatId` absent; three new
  cases (required-channel, bad-enum, update + search-by-`channelName`).
- `riders.e2e-spec.ts`: round-trips all six; asserts `vehicleType` defaults to `BIKE`; new
  case updating licensing fields incl. `licenseNo: null`.
- `customers.e2e-spec.ts`: round-trips `notes`.
- `pnpm lint && pnpm build && pnpm test && pnpm test:e2e` — all green.

**Behaviour changes callers must know about:**
- `POST /shops` now **requires** `channelType` and `channelName` → existing callers 400.
- `GET /shops?search=` now also matches `channelName`.
- `POST /riders` accepts six new optional fields; omitting `vehicleType` still yields `BIKE`.

---

## Phase 3.5 — Townships, round-robin assignment, rider dashboard — COMPLETE (2026-09-29)

### 3.5.1 Townships

- **`townships`**: `id uuid` PK, `name text` unique. Yangon has ~33. A lookup table gives referential integrity and a picker; free text would produce `Hlaing` / `Hlaing Township` / `လိုင်း` as three values.
- **`rider_townships`**: `rider_id` + `township_id`, composite PK. Many-to-many — a rider may cover several; a township may have several riders. **Removing a rider from a township is the availability off-switch** (decision 6).
- **`orders.township_id`** → `townships.id`, chosen at creation, `.notNull()`. An order with no township has no rotation to draw a rider from.
- **`township_rotation`**: `township_id` PK, `last_assigned_rider_id`, `updated_at`. The stored round-robin cursor, one row per township.
  - **Why a stored cursor instead of "whoever was assigned least recently":** the two look equivalent but are not. If two orders are assigned in the same millisecond, "least recently" has no correct answer and the system picks arbitrarily, so round-robin quietly becomes unfair. A stored pointer has no ambiguity, is O(1), and survives restarts.
  - **Why its own table rather than a column on `townships`** (decision 15): `townships` is reference data that office staff edit by hand, while the cursor is operational state written on every order. Keeping them apart also avoids a rider foreign key on the townships row with its awkward delete case.
  - A rider who is added to a township later enters the rotation at the end.
- `customers.address` stays free text; the township is per-order, not per-customer.
- `shops.township_id` — **not included**; not requested, and `orders.township_id` covers township reporting.
- **Assignable-township lookup:** a township is selectable when at least one **ACTIVE** rider covers it. This is derived, never stored — a stored flag would go stale the moment rider coverage changes.
- **Township endpoints:** `GET /townships` (`orders.read`) lists all with derived `selectable`; `GET /townships?selectable=true` is the order form's eligible-only list; `POST /townships` (`orders.create`) creates a name; `PATCH /townships/:id` (`orders.update`) renames it. There is no delete endpoint because orders and rotation state reference townships.

### 3.5.2 Order lifecycle

- `orderStatusEnum`: 8 → **3 values**: `ASSIGNED`, `DELIVERED`, `FAILED`.
- `deliveryStatusEnum`: 4 → **3 values**: `ASSIGNED`, `DELIVERED`, `FAILED`.
- `DELIVERY_HISTORY_EVENTS`: drop `STARTED` → `ASSIGNED`, `REASSIGNED`, `DELIVERED`, `FAILED`, `RETRY_CREATED`.
- Drop `delivery_attempts.startedAt`. The consequence is accepted: there is no "when did the rider set off" signal, so **no transit-time metric**. Cheap to re-add later as an optional rider tap; not worth building now.
- `orders.status` default becomes `ASSIGNED`; the first history row is `null → ASSIGNED`.
- `order_status_history.from_status` is nullable already and carries the initial `null → ASSIGNED` row; `.to_status` remains `NOT NULL`.
- `OrderStateService.ALLOWED_TRANSITIONS` collapses to:

  ```ts
  {
    ASSIGNED:  ['DELIVERED', 'FAILED'],
    DELIVERED: [],
    FAILED:    ['ASSIGNED'],   // retry edge, kept
  }
  ```

- `delivery_attempts_one_active_order_unique` narrows from `WHERE status in ('ASSIGNED','OUT_FOR_DELIVERY')` to `WHERE status = 'ASSIGNED'`. The two `inArray(...)` predicates in `deliveries.service.ts` become equality checks.
- **Delete Phase 4** — see §Phase 4.
- **Delete `POST /deliveries/:id/start`** — route, service method, and history event. The `complete` and `fail` guards relax from requiring `OUT_FOR_DELIVERY` to requiring `ASSIGNED`, so a rider marks a parcel delivered in one tap straight from assignment. `assertOwnership` stays on both.

### 3.5.3 Round-robin assignment

**The rider never chooses an order. The system assigns it.** There is no unclaimed pool, no claim endpoint, and no `deliveries.claim` permission key.

`POST /orders` gains a required `townshipId` and performs all of the following **in one transaction** — all eight steps or none:

1. Township exists → else 400.
2. At least one **ACTIVE** rider covers it → else 400, `"Township 'X' has no active rider; assign a rider before creating orders"`. **Enforced server-side on purpose:** a greyed-out dropdown is UI convenience, not a guarantee. A direct API call must not create an unserviceable order.
3. Pick the next rider from the locked cursor.
4. Insert the order (`ASSIGNED`, `township_id`).
5. `order_status_history` (`null → ASSIGNED`).
6. `delivery_attempts` #1 (`ASSIGNED`).
7. `delivery_attempt_history` (`ASSIGNED`).
8. Advance the cursor.

Steps 4–7 are inserted atomically in the order-creation transaction. Initial `null → ASSIGNED` is creation history, not a transition from an existing row; `OrderStateService.applyTransitionInTransaction` continues to own every subsequent transition.

**Cursor mechanics.** Lock the `township_rotation` row `FOR UPDATE`; walk the covering riders in a stable order (`createdAt`, `id` as tiebreak) starting *after* `last_assigned_rider_id`, wrapping to the start. The lock is what stops two orders inserted in the same millisecond for one township from both landing on the same rider. Two edge cases to handle explicitly: no rotation row yet (bootstrap it), and the last-assigned rider has since been removed from the township (skip to the next eligible).

**Even distribution is the guarantee round-robin exists to provide.** A test asserts N orders across M riders distributes evenly; a wrap-around unit test covers the tail.

### 3.5.4 Rider board and rider name on the order

`OrderResponseDto` has no rider field at all, and the list query (`orders.service.ts:80-83`) is a bare `select().from(orders)` with no joins.

- **Source: the latest `delivery_attempts` row** for the order → `riders` → `users.name`. The attempt is the authoritative record of who is/was delivering; `order_status_history.changedBy` is an audit trail containing one `ASSIGNED` row per attempt, so it would need a "latest" filter too.
- **⚠️ Do not `leftJoin` `delivery_attempts` directly.** An order can have up to 3 attempts, so a plain join **duplicates rows**, breaks `limit`/`offset` pagination, and desyncs the separate `count(*)` query at line 87. Use a lateral join or correlated subquery picking the highest `attemptNumber`.
- Office responses return `riderId`, `riderName`, and `riderPhone` — the office needs a number to call.
- **Deliberately not denormalized** onto `orders`. A join keeps one source of truth; denormalizing would freeze the name at assignment time and drift from the user record.
- Note: `delivery_attempts.riderId` is `ON DELETE RESTRICT`, so a rider with delivery history cannot have their user deleted. That is desirable — **deactivate riders, don't delete them.**

### 3.5.5 Rider surface — the security boundary

A rider's only surface. Board/dashboard scope comes from the rider linked to the JWT; every rider delivery mutation re-checks row ownership, not just the permission.

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /rider/board?filter=mine\|all` | `deliveries.read` | Orders in **my** townships. Own entries full detail; colleagues' redacted. |
| `GET /rider/dashboard?date=YYYY-MM-DD` | `deliveries.read` | Aggregates only, no order lists. |
| `GET /riders/me/deliveries` | `deliveries.read` | Exists. My assigned + in-flight work. |
| `POST /deliveries/:id/complete\|fail` | `deliveries.update` | Exist, already ownership-checked. `start` is gone. |
| `POST /deliveries/:orderId/assign` | `deliveries.create` | **Office override.** Not a rider path. |
| `PATCH /deliveries/:id/reassign` | `orders.update` | **Office override.** |
| `GET /townships?selectable=true` | `orders.read` | Office dropdown — rider-covered townships only. |

- **⚠️ RIDER must NOT be granted `orders.read`.** That would open the office `GET /orders` endpoint to every rider, which is the exact boundary this separate surface exists to hold. The board is gated on `deliveries.read` and self-scoped to townships instead. `GET /townships?selectable=true`, delivery detail/history, and reassign stay office-only (`orders.read`/`orders.update`).
- **No new permission keys.** `pickups.*` is deleted; the catalog goes 13 modules / 68 keys → 12 / 62.
- **Office overrides are kept deliberately.** With no `start` step and one-tap completion, the office needs a way to correct a mis-assignment. Round-robin is the default path, not the only path.
- `retry` and `MAX_DELIVERY_ATTEMPTS = 3` stay as-is.

**PII redaction (option B).** A rider sees their own orders in full. Other riders' orders in their township are shown as **routing context only**:

- Shown on all rows: `id`, `trackingCode`, `status`, `assignedRiderName`, `townshipName`, `shopName`, `createdAt`.
- The rider's own rows additionally include `deliveryAttemptId` and `attemptNumber` for own-only actions; colleagues' rows do not expose attempt IDs.
- Withheld: customer name, phone, address, `codAmount`, `deliveryFee`, `packageInfo`, `notes`.

The rationale is that under round-robin every order is assigned at creation, so **no order is ever waiting to be picked up.** The board is purely informational — how my township looks, is this one mine, who has it, what is still undelivered — and none of that needs a stranger's phone number or their cash. Customer contact details are personal data carried in a field app; COD amounts are commercially sensitive and are the most likely source of inter-rider disputes. Withholding them costs the rider no capability.

**The redaction is applied in the service layer, not the DTO**, so no query parameter can return the unredacted shape.

- **Date navigation is a server-side `date` param**, not a hard "today" filter. A fixed today-window hides yesterday's undelivered work at 00:01 and loses it entirely at month-end rollover.
- **Timezone:** `APP_TIMEZONE` is now accepted by env validation, defaults to `Asia/Yangon`, and is used to derive date boundaries for board and dashboard queries.

### 3.5.6 Rider dashboard

Aggregates only — the order lists stay in `/rider/board` and `/riders/me/deliveries` rather than being re-embedded.

For a rider and a selected date (default today, in `APP_TIMEZONE`):

- Counts: **assigned** (open work), **delivered**, **failed**
- **Success rate** = `delivered / (delivered + failed)`, returned as a percentage from 0–100 (zero if there are no completed attempts)
- **COD collected** = `sum(codAmount)` on delivered
- **COD outstanding** = `sum(codAmount)` on assigned + failed

COD figures are included because this is a cash-on-delivery operation and uncollected COD is the main operational risk. "Performance" needs a definition of good — an on-time rate or a per-rider target is a business decision and a new column, not a derivation. Metrics are based on the latest attempt per order in the selected attempt-assignment-date cohort; COD amounts are exact decimal strings. This implementation uses the approved metric set; revise only if the business defines a different score.

- Read-only. `deliveries.read` is sufficient; **no new permission key**.

### 3.5.7 Migrations

**Forward migrations, not a squash.** Part A already landed as `0012_ancient_may_parker`; rewriting that history is not worth the churn. Before applying 3.5 locally, `orders=0`, `delivery_attempts=0`, `pickups=0`, and the Part A tables were empty, so the required township/status additions needed no data backfill.

- Postgres cannot drop enum values. Recreate `order_status` and `delivery_status`, then `ALTER COLUMN … TYPE … USING col::text::newtype` across `orders.status`, `order_status_history.from_status`, `order_status_history.to_status`, and `delivery_attempts.status`. All are empty.
- Add `townships`, `rider_townships`, `township_rotation`, `orders.township_id`.
- Drop `pickups`, `pickup_orders`, `delivery_attempts.startedAt`; rewrite the active-attempt unique index.
- Re-export every new table from `src/common/database/schema.ts`.
- `0013_glossy_marten_broadcloak.sql` adds township structures, changes status/event enums, and removes `started_at`; its existing partial index must be dropped **before** changing the delivery status column to text, then recreated with `status = 'ASSIGNED'`.
- `0014_fat_mephisto.sql` drops pickup tables/type, removes stale `pickups.*` permission rows, and adds `orders.create/read/update` to the seeded OFFICER role when present. `scripts/seed.ts` owns the same default grants for fresh/reseeded databases.
- After applying, `pnpm db:generate` reports `No schema changes, nothing to migrate`.

---

## Phase 3.6 — Daily rider custody — DEFERRED, not authorized

**No implementation is authorized.** This section records what the client's described daily loop will require so the name collision is avoided later, and nothing more.

The loop as described: a rider takes ~10 packages in a day; if 5 are not delivered, those parcels return to the office and are re-signed the next day together with any new packages. A rider failing to deliver 5 in a day is treated as a failure.

**What Phase 3.5 deliberately does not model.** Nothing above has a notion of a *day*, a *custody handover*, or an *undelivered return*. `ASSIGNED` means "this rider has it and must deliver it."

**What 3.6 will need to add — shape only, not design:**

1. **A day entity** (a shift or daily run) to group what a rider signed out on a given date.
2. **A custody handover** — signed out / signed back in, with timestamps, so "still held" versus "came back" is a question the database can answer.
3. **An undelivered-return state** on the order. An order that failed and is physically back at the office is naturally a **second `delivery_attempts` row**, which is exactly what the attempt ledger already models and what `MAX_DELIVERY_ATTEMPTS = 3` currently caps.
4. **A daily failure classification** — the "5 undelivered" rule becomes a query over attempts, not a spreadsheet.

**Name collision to avoid:** Phase 6 owns `RETURNED` as the *customer return-to-sender* concept. It was removed from the enum in 3.5 (decision 9) and is re-added when Phase 6 is approved. The client's *undelivered-return* is a different thing and needs a distinct name. Decide it before 3.6, not after.

**Open:** whether a re-signed parcel goes back to the same rider or to the next in rotation; whether the 5-of-10 rule is enforced or only reported; and what happens to `codAmount` on an undelivered parcel (that is a Phase 6 payment question).

---

## Part B — Frontend (`d_frontend`) — COMPLETE

Implemented and pushed in `d_frontend` (`4b5d97d`, with follow-up `390a08e`). The handoff at `../d_frontend/BACKEND_PHASE_3_5_HANDOFF.md` is retained as the API/security contract reference for future frontend maintenance.

**B0 — Contract regenerated.** `src/types/api.ts` was generated from the implemented backend via `pnpm codegen`; regenerate again only when the API contract changes. Never hand-edit generated `api.ts`.

**B1 — Keep the hand-written DTO workarounds.** `src/features/*/api.ts` hand-types around codegen emitting `phone: Record<string, never> | null`. Verified still present: `@ApiPropertyOptional({ nullable: true })` on `string | null` still yields `Record<string, never>`, and the regenerated output additionally marks them optional (`phone?:`). Needs a small tweak, not a rewrite. Do not delete it as cleanup.

**B2 — Shops: re-add three fields.** `channelType` + `channelName` required on create, `notes` optional. `validations.ts` and `api.ts` already declare all three — re-verify rather than rewrite. `ShopsTable.tsx:43` already renders the `channelType` badge via `CHANNEL_LABELS`; keep it.

**B3 — Riders: a redesign, not a field patch.**
- Re-key list rows, detail, and edit paths from `userId` to `id`.
- The nested `user: RiderUserDto` is gone; `name` / `email` / `phone` / `status` are flattened. Remove nested access.
- Re-add the six licensing fields. `RiderForm.tsx:145` has an `isAvailable` toggle and `RidersToolbar.tsx:75` filters on it — **remove both**.
- Add a **township multi-select** to the rider form. Removing a rider from a township is the availability off-switch, so this control is operationally significant, not cosmetic.
- `RiderVehicleType` returns — add a label map following the existing `CHANNEL_LABELS` pattern.

**B4 — Rider surface (new, separate from the office orders page).**
- Route tree: `/rider` with a dashboard and a township board, both date-navigable (not "today"-locked).
- **There is no Claim or Start button.** Orders arrive already assigned. The board is a read-only view of the rider's townships; only own assigned orders offer direct Complete/Fail actions.
- Enforce the redaction rule in the UI too — colleagues' rows render without customer details or COD — but the API is the actual boundary.
- Guard the whole tree by role — a RIDER logging in must never land on the office orders page.
- Shared date state so the dashboard and board agree on the selected date.

**B5 — Office orders page.** New township column and rider name on each order. Ship against §3.5.4 or the column will be empty.

**B6 — Enum label maps**, one shared module: `OrderStatus` (3) · `DeliveryStatus` (3) · `FailureReason` (6) · `DeliveryHistoryEvent` (5) · `RiderVehicleType` (4) · `ShopChannelType` (2). Note `OrderStatus` drops 8 → 3 and `DeliveryStatus` 4 → 3 — any existing label map is badly stale.

**B7 — RBAC mirror:** remove `pickups.*` from `src/types/permission.ts` to match the backend's 12 modules / 62 keys. Phase 3.5 adds no keys. Keep RIDER free of `orders.read`.

**B8 — Gate:** `pnpm lint && pnpm build && pnpm test`.

---

## Part C — End-to-end verification

Verified against the running API with seeded OWNER and RIDER accounts. Backend gates: 73 unit tests and 66 e2e tests; frontend gates: lint/build/existing tests pass.

**Happy path:** office inserts an order with a township that has active riders → the order lands **already `ASSIGNED`**, with rider A from the rotation, a first `delivery_attempts` row, and a `null → ASSIGNED` history entry. The next insert for that township goes to rider B; a fourth wraps back to rider A. Rider A's board shows it in full; rider B's board shows it redacted. Rider A taps **complete** — one tap, no start step. The office sees rider A's name and phone on the order.

**Guard paths:** inserting into a township with no active rider returns 400 with the explicit message, and that township does not appear in the office picker. A rider outside the township's coverage cannot see the order at all. A rider cannot mark another's order delivered — `assertOwnership` rejects it.

**Failure path:** `fail` with a `FailureReason` → `retry` → confirm the 3-attempt cap leaves the order `FAILED`. Confirm the `start` route is now 404. Confirm an office `reassign` moves a mis-assigned order and records `REASSIGNED` in the attempt history.

**Concurrency:** two simultaneous inserts for one township land on two different riders — the `FOR UPDATE` cursor serialises them.

---

## Open questions / deferred decisions

1. ~~**`customers.notes`**~~ — **RESOLVED: restored.** The frontend has it wired in
   `CustomerForm.tsx:43`, `mappers.ts`, `validations.ts`, and `api.ts`; the tag had the
   column. Leaving it dropped would have silently dropped the user's input on every save.
2. **Performance target** — current dashboard metrics are implemented; an on-time rate or per-rider
   target still needs a business definition if requested.
3. **Phase 3.6 design decisions** — re-sign to the same rider or the next in rotation; whether the
   undelivered count is enforced or only reported; what `codAmount` means on an undelivered parcel.
4. **Does a shop have a township?** Not included. Needed only for per-shop-township reporting.
