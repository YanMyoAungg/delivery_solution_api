# Backend delta — what changed, and what the frontend must do

Scope: **this session's change** (the auth revocation fix, §1–3) plus the **Phase 2 master-data contract** (§4) — the three screens the frontend builds next. Everything earlier (login/me/change-password, users CRUD, RBAC, error envelope, pagination) is already in the generated client and is not restated.

---

## 1. The change

A bug in the auth guard was fixed. Nothing in the API contract moved; one behaviour did.

### What was broken

The guard rejects a token whose issue instant precedes `users.password_changed_at` — change your password, every older token dies. It compared a **millisecond** DB column against the JWT `iat` claim, which is **whole seconds** (RFC 7519). Dividing left a fractional second, so `changed > issued` was true even for a token minted *after* the change, in the same second.

What that looked like from the frontend:

- Create an account, then log in as it within the same second → **spurious `401` on a valid token.**
- Change password, then log straight back in → **spurious `401`.**

~98% reproducible on the create-then-login path, since two HTTP calls land in the same second almost every time. Easy to mistake for flaky tests or a bad token cache.

### What changed

`AuthService.login` stamps a `tokenIssuedAtMs` claim (`Date.now()`) inside the JWT; the guard compares it millisecond-to-millisecond with the column. Both clocks now have the same resolution, so sub-second ordering is decidable.

Files: `src/auth/auth.service.ts`, `src/common/auth/auth.guard.ts`, `src/common/auth/auth.constants.ts`, `src/common/auth/auth.guard.spec.ts`.

### Frontend impact: none at the code level

`tokenIssuedAtMs` is a claim inside the **signed** token. The client never decodes it, never sends it, never reads it. **No type, no generated-client field, and no request/response shape changes.** Do not regenerate the client for this — the OpenAPI spec is byte-identical.

`★ Insight ─────────────────────────────────────`
The whole fix is invisible to the API contract on purpose. Adding a claim to a JWT payload changes only the *signed string*, not the token's interface — the client treats the token as an opaque handle either way. That is why the frontend cost here is deleting a workaround, not writing code.
`─────────────────────────────────────────────────`

---

## 2. What the frontend must do

Three items, in order of importance.

**1. Delete any workaround for the spurious 401.**
If you added a login retry, a delay before login, or a special case for a 401 right after account creation — remove it. The cause is gone. Leaving it in hides the next real 401.

**2. Keep change-password → re-login.**
`POST /api/v1/auth/change-password` still returns `204` with **no body** and **no fresh token**. Every token minted before the write is now invalidated *correctly* — including one minted in the same second. So a successful change-password is still followed by a `401` on the next request. Drop the stored token, clear cached user state, route to login.

If the frontend currently *relies* on the bug (i.e. it worked only because the same-second token was wrongly kept alive) the symptom flips: previously-working sessions now get a `401` after a password change. That is the fix working, not a regression — route to login.

**3. `401` handling is otherwise unchanged.**
Same status, same triggers: missing / expired / malformed token, deactivated user, stale token.

### Error strings — unchanged, listed for reference

| Status | `message` | Cause |
|---|---|---|
| `401` | `Invalid credentials` | unknown email **or** wrong password (deliberately identical) |
| `401` | `Account is deactivated` | correct password, `status: INACTIVE` |
| `400` | `Current password is incorrect` | wrong `currentPassword` |

---

## 3. Deploy behaviour — no forced logout

Tokens issued before this build ships carry no `tokenIssuedAtMs`. The guard detects the missing claim and falls back to the old whole-second comparison, so they keep working and expire naturally within `JWT_EXPIRES_IN` (1 hour default).

Consequence worth knowing: for up to one hour after deploy, a token minted in the same second as a password change keeps the old ambiguous behaviour. The frontend cannot detect this and does not need to — it self-heals as tokens rotate. It is the reason the claim is optional rather than required.

---

## 4. Master data — shops, customers, riders

Shipped in a prior session (Phase 2), **not** in this session's diff. Documented here because these are the three screens the frontend builds next, and the shapes have traps that a regenerated client will not warn you about.

All three modules expose the same five routes under `/api/v1`, and all three return the standard `{ data, meta }` envelope on list where `meta` is `{ page, perPage, total, totalPages }`.

### Routes and permission keys

| Route | shops | customers | riders |
|---|---|---|---|
| `GET /` | `shops.read` | `customers.read` | `riders.read` |
| `POST /` | `shops.create` | `customers.create` | `riders.create` |
| `GET /:id` | `shops.read` | `customers.read` | `riders.read` |
| `PATCH /:id` | `shops.update` | `customers.update` | `riders.update` |
| `DELETE /:id` → `204` | `shops.delete` | `customers.delete` | `riders.delete` |

`OFFICER` holds **create + read + update on all three and never delete** — so any delete control must be hidden or disabled for that role, not merely error-handled. It is a `403`, not a `404`.

### List query parameters

| Module | Search matches | Filters | Defaults |
|---|---|---|---|
| shops | `name`, `phone`, `channelName` | `channelType` | `page=1`, `perPage=20` (max 100) |
| customers | `name`, `phone` | — | `page=1`, `perPage=20` (max 100) |
| riders | rider `name`, `email`, `phone` (on the joined user row) | `vehicleType`, `isAvailable`, `status` | `page=1`, `perPage=20` (max 100) |

### shops

```ts
// create — name, channelType, channelName required; the rest optional
{ name: string (max 150),            // required + unique + non-empty
  phone?: string | null (max 20),
  address?: string | null (max 300),
  notes?: string | null (max 500),
  channelType: 'VIBER' | 'TELEGRAM',
  channelName: string (max 200) }

// update — every field above optional, same limits

// response
{ id, name, phone: string|null, address: string|null, notes: string|null,
  channelType, channelName, createdAt: string, updatedAt: string }
```

- **Duplicate `name` → `409`.** This is the only unique constraint across the three modules.
- `chatId` exists on the table but is **deliberately absent from every DTO** — the Phase 7 channel bot writes it. Do not render or send it; `forbidNonWhitelisted` turns it into a `400`.
- A shop list has no detail-only fields, so `GET /:id` and a row from `GET /` are the same shape.

### customers

```ts
// create — name is required by the type but only @IsString + MaxLength at runtime
// (no @IsNotEmpty), so an empty string is accepted and stored
{ name: string (max 150),
  phone?: string (max 50),
  address?: string (max 500),
  notes?: string (max 500) }

// update — all optional

// response
{ id, name, phone: string|null, address: string|null, notes: string|null,
  createdAt: string, updatedAt: string }
```

- **No unique constraints.** Two customers with the same name both `201`. Do not build a "duplicate, are you sure?" flow expecting the server to agree — it won't, and any client-side uniqueness rule is your own invention.
- **`name` has no `@IsNotEmpty`** — an empty string passes validation and is stored. If the form requires a non-empty name, enforce it client-side; the API will not return `400` for you.
- No shop foreign key. Customer↔shop association arrives with orders in Phase 3; there is nothing to link today.

### riders — the one to read carefully

A rider is **1:1 with a `users` row**. `riders.user_id` is both the primary key and the foreign key to `users.id` (`ON DELETE CASCADE`), which is what enforces the one-to-one. That single fact drives every trap below.

```ts
// create — provisions the users row itself; password is required, there is no invite flow
{ name: string (max 100),
  email: string (email, max 255),
  password: string (8–100),
  phone?: string (max 50),
  status?: 'ACTIVE' | 'INACTIVE',              // default 'ACTIVE'
  licenseNo?: string (max 100),
  vehicleType?: 'BIKE'|'MOTORBIKE'|'CAR'|'OTHER',  // default 'BIKE'
  vehiclePlate?: string (max 50),
  nrcNumber?: string (max 100),
  emergencyContactPhone?: string (max 50),
  isAvailable?: boolean,                        // default true
  notes?: string (max 500) }

// update — rider profile + the user's name/phone/status. NO email, NO password, NO roleId.
{ name?, phone?, status?, licenseNo?, vehicleType?, vehiclePlate?,
  nrcNumber?, emergencyContactPhone?, isAvailable?, notes? }

// response — note the id field name
{ userId: string,                    // <-- the id. There is NO `id` key.
  licenseNo: string|null,
  vehicleType: RiderVehicleType,
  vehiclePlate: string|null,
  nrcNumber: string|null,
  emergencyContactPhone: string|null,
  isAvailable: boolean,
  notes: string|null,
  createdAt: string, updatedAt: string,
  user: { id: string, name: string, email: string,
          phone: string|null, status: 'ACTIVE'|'INACTIVE' } }   // <-- no role, no roleId
```

Five traps, in the order they will bite:

1. **`userId` is the id.** A row has no `id`, so `rider.id` is `undefined` and `key={rider.id}` silently collapses every row in a list. Use `rider.userId`. The same value is what goes in the URL — `/api/v1/riders/:id` *is* the `users.id`.
2. **`user` carries no role.** `RiderUserDto` is `{ id, name, email, phone, status }` only — no `role` and no `roleId`. If the UI needs to show "RIDER", it is implied by the endpoint, not returned. To read a role you fetch `/api/v1/users/:id` with the `users.read` permission (ADMIN/OFFICER), which a rider-only screen may not have.
3. **PATCH is one combined DTO spanning two tables.** It updates the rider profile *and* the user's `name` / `phone` / `status` in a single transaction. This is deliberate: `OFFICER` has `riders.update` but **not** `users.update`, so splitting the aggregate would put half of it out of their reach. Practical consequence — a rider edit form has **one** save button, not one per table.
4. **Email, password, and `roleId` on `PATCH /riders/:id` → `400`.** They are not on the update DTO and `forbidNonWhitelisted` rejects unknown fields. Those are ADMIN-only through `/api/v1/users/:id`. Do not include a read-only email input in the edit form's payload — send only changed whitelisted fields.
5. **`POST /riders` requires a password**, and `DELETE` removes **both** rows — the rider profile and the backing user. Deleting a rider therefore also destroys their login. A rider cannot delete themselves: `DELETE /api/v1/riders/<own id>` → `400`.

`★ Insight ─────────────────────────────────────`
The combined PATCH is the interesting design decision here, and it follows from how permission keys compose rather than from how the tables look. The aggregate is 1:1 across two tables, but the permission catalog grants `riders.update` and `users.update` separately. Splitting the DTO would make a rider's name editable only by someone holding `users.update` — meaning OFFICER could edit a rider's licence number but not their name. Collapsing both halves behind `riders.update` keeps the aggregate reachable under the one permission that describes it. The cost is that "update a rider" now touches two tables and must be transactional; the benefit is that no user-facing operation is split across permissions in a way no UI could express.
`─────────────────────────────────────────────────`

### Error shapes you will hit

| Status | Trigger |
|---|---|
| `400` | unknown field (e.g. `email` on rider PATCH, `chatId` on shop), bad UUID in `:id`, rider self-delete |
| `401` | missing / invalid / stale token |
| `403` | role lacks the permission — notably `OFFICER` on any `DELETE`, and `RIDER` on all three modules |
| `404` | unknown id |
| `409` | shop `name` already exists |

---

## 5. Not part of this change

Already in the frontend's client and untouched: `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` shapes; `/users` CRUD; `/roles`, `/permissions`, `PUT /permissions/roles/:roleId`; the `{ statusCode, message, error }` envelope with `message: string | string[]`; the `{ data, meta }` pagination envelope.

Still absent from the API, so no screens: orders, pickups, deliveries, returns, payments, reports, notifications.

---

## 6. Verification (the §1 fix)

Confirm from the client side, no backend access needed:

1. Log in, change password, then immediately hit any authenticated route.
2. Expect `401` — correct. Then log in again with the new password; expect `200`.
3. Repeat as fast as possible. The result must not vary between runs. Before the fix, step 2's outcome depended on which half-second you landed in.

---

## Deep dive

- `docs/auth-token-revocation-explained.md` — the bug itself: two clocks at two precisions, why Phase 2 exposed it, why the first fix attempt failed, why the millisecond claim was the answer. English and Burmese. Read that for the reasoning; §1–3 here are only the frontend-facing summary.
- `/api/v1/docs-json` — the authoritative OpenAPI contract for the §4 shapes. Everything in §4 was read from the controllers and DTOs; the spec is generated from the same source, so regenerate from it rather than hand-writing types.
