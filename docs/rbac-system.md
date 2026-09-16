# ခွင့်ပြုချက် (Permission) နှင့် Dynamic Role-based Access Control (RBAC) စနစ် ရှင်းလင်းချက်

ဒီစာမျက်နှာက `d_api` (NestJS) ရဲ့ ခွင့်ပြုချက်စနစ် အလုပ်လုပ်ပုံကို ရှင်းပြပါတယ်။ Frontend (d_frontend) ကနေ ဒီစနစ်ကို ဘယ်လို ဆက်သွယ်သုံးရမလဲဆိုတာလည်း ပါဝင်ပါတယ်။

---

## 1. အခြေခံ သဘောတရား (Basic Concept)

အသုံးပြုသူတစ်ယောက်ဟာ **role** တစ်ခု ရှိပြီး၊ အဲဒီ role မှာ **permission keys** (ခွင့်ပြုချက်များ) တစ်စုကို ပေးထားပါတယ်။
`user → role → permissions`၊ ဒီလိုဆက်စပ်ထားပြီး အသုံးပြုသူရဲ့ **role** ပေါ်မူတည်ပြီး API route တွေကို သုံးလို့ရ/မရ ဆုံးဖြတ်ပါတယ်။

**ဒီစနစ်က အပြည့်အဝ dynamic ဖြစ်ပါတယ်** — owner/admin က ကုဒ်မပြင်ဘဲ UI/API ကနေ role အသစ်ဆောက်၊ permission key အသစ်ထည့်၊ role တွေကို user တွေနဲ့ assign လုပ်နိုင်ပါတယ် (spatie/laravel-permission ပုံစံပါ)။

---

## 2. Database Tables (၃ ခု + users)

### `roles` — အခန်းကဏ္ဍများ
| Column | ရှင်းလင်းချက် |
|--------|--------------|
| `id` | uuid (PK) |
| `name` | ထပ်တူမရတဲ့ အမည် (UPPER_CASE၊ 2–32 char)။ ဖန်တီးပြီးရင် ပြောင်းလို့မရ — သတ်မှတ်ချက်အတွက် stable identifier |
| `description` | ရှင်းလင်းချက် (optional) |
| `is_system` | boolean — **system role** အမှတ်အသား။ `OWNER` က `is_system=true` |

### `permissions` — ခွင့်ပြုချက် စာရင်း (Catalog)
| Column | ရှင်းလင်းချက် |
|--------|--------------|
| `id` | uuid (PK) |
| `name` | ထပ်တူမရတဲ့ string။ ဒီ name ကိုပဲ ကုဒ်ထဲမှာ တိုက်ရိုက်သုံးပါတယ်။ ဥပမာ `users.create`, `roles.manage` |
| `description` | ရှင်းလင်းချက် (optional) |

> **Domain ဆိုတာ column မဟုတ်ဘူး** — `name` ရဲ့ ✅ ရှေ့ဆက် (dot ရှေ့အပိုင်း) ကိုပဲ UI မှာ အုပ်စုဖွဲ့ပြသဖို့ ယူသုံးပါတယ် (guard မှာ မပါဝင်ဘူး)။ ဥပမာ `users.create` နဲ့ `users.list` → `users` အုပ်စု။

name အသစ်ကို UI/API မှတဆင့် **ဖန်တီး/ဖျက်လို့ရပါတယ်** (format: `domain.action` lowercase။ ဖျက်ဖို့ အဲဒီ name ကို ဘယ် role ကမှ grant မလုပ်ထားရပါ။)

### `role_permissions` — role နဲ့ permission ဆက်စပ်ဇယား (Join Table)
| Column | ရှင်းလင်းချက် |
|--------|--------------|
| `role_id` | `roles.id` → (FK, delete လျှင် cascade) |
| `permission_id` | `permissions.id` → (FK, delete လျှင် cascade) |
| (primary key = `role_id` + `permission_id`) | တွဲတူထပ်လို့မရ |

ဒါက "role X က permission Y ကို ရရှိသည်" ဆိုတဲ့ အချက်အလက် တစ်ကြောင်းစီပါ။

### `users` — ရှိရင်း ဇယားကို ပြုပြင်ထားပါတယ်
- ရှေး `role` (enum string) ကို ဖျက်ပြီး **`role_id`** (uuid FK → `roles.id`) အစားထိုးထားပါတယ်။
- user တစ်ယောက်ရဲ့ role ကို `users.role_id` ကနေ `roles` ကို join ပြီး ရယူပါတယ် (open-ended — enum ကန့်သတ်မထား၊ ဖန်တီးထားတဲ့ role တိုင်း assign လို့ရ)။

```
users.role_id ───► roles.id ◄─── role_permissions.role_id
                       │                  │
                       └───────────────┘  └──► permissions.id ◄── permissions (catalog)
```

---

## 3. System Role (OWNER) — Supreme Invariant

`is_system=true` ဖြစ်တဲ့ role (လက်ရှိ `OWNER`) ကို **system role** လို့ခေါ်ပြီး အောက်ပါအာမခံချက်တွေ ရှိပါတယ်:
- **ခွင့်ပြုချက်အားလုံး အမြဲရှိသည်** — `role_permissions` ဇယားမှာ row ဘယ်လောက်ပဲ ရှိ/မရှိ၊ catalog ထဲက key အားလုံးကို ရပါတယ် (guard က system role ဆိုရင် catalog ကို တိုက်ရိုက်ပြန်ပေးတယ်)။
- **မဖျက်လို့မရ**၊ **grant မပြုပြင်လို့မရ**၊ **user CRUD ကနေ မပြုပြင်လို့မရ** (status/password/role ပြောင်းလို့မရ)။
- ADMIN ဖန်တီးထားတဲ့ role တွေက system မဟုတ်ဘူး (is_system=false)။

---

## 4. Scope Rules — ဘယ်သူက ဘာကို ပြုပြင်နိုင်သလဲ

| Caller | Role ဖန်တီး/ပြင်လို့ရ | Role ဖျက်လို့ရ | Permission key လုပ်လို့ရ | User assign |
|--------|---------------------|----------------|--------------------------|-------------|
| `OWNER` (system) | မှန်သမျှ (OWNER ကိုယ်တိုင်မှလွဲ) | မှန်သမျှ (အသုံးပြုနေတဲ့ role မှလွဲ) | ရတယ် | မှန်သမျှ |
| `ADMIN` | OFFICER/RIDER + ဖန်တီးထားတဲ့ role | အတူတူ | ရတယ် | OWNER/ADMIN မှလွဲ |
| အခြား | — | — | — | — |

**မဖြည့်ဆည်းနိုင်တဲ့ စည်းမျဉ်းတွေ (backend မှာ enforced):**
- **No self-empowerment:** ဘယ်သူမှ ကိုယ့် role ကိုယ် grant မပြုပြင်နိုင်၊ ကိုယ့်ထက် ပိုမြင့်တဲ့ role ကို assign/ပြုပြင်လို့မရ။
- **Grant subset rule:** caller က ကိုယ့်မှာမရှိတဲ့ permission key ကို တခြား role ကို ပေးလို့မရ (`ADMIN` ဖြင့် `OWNER` ပမာဏ grant မပေးနိုင်)။
- **Role ဖျက် = သုံးနေတဲ့ role:** user တစ်ယောက်ယောက် assign ထားတဲ့ role ကို ဖျက်ရင် **409** (silent demotion မလုပ် — အရင်ပြောင်းခိုင်းတယ်)။
- **Permission key ဖျက် = grant လုပ်ထားရင်:** ဘယ် role ကမှ grant လုပ်ထားတဲ့ key ကို ဖျက်ရင် **409** (silent revocation မလုပ်)။
- role `name` က ဖန်တီးပြီးရင် မပြောင်းလို့မရ (description ပဲ ပြောင်းရတယ်)။

---

## 5. ကုဒ်ထဲက စာချုပ် (Code Contract) — `permission-keys.ts`

`src/common/auth/permission-keys.ts` က လူသိများတဲ့ key တွေရဲ့ စာရင်း (`PERMISSION_KEYS`) ကို TypeScript အဖြစ် သတ်မှတ်ထားတယ် — **autocomplete အတွက်သာ**။ ဒါပေမဲ့ type က `(string & {})` ပါဝင်လို့ **UI/API ကနေ ဖန်တီးတဲ့ dynamic key တွေလည်း လက်ခံနိုင်တယ်**။

- Route တွေမှာ `@RequirePermissions('users.list')` — definition ရှိရင် autocomplete ရတယ်။
- **ခွင့်ပြုချက် validity က DB catalog + grant ကပါ** — ကုဒ်က key စာရင်းကို မစစ်တော့ဘူး။ catalog မှာမရှိတဲ့ key ကို ဘယ်သူမှ မရထားဘူး = 403 (fail closed)။
- **သတိပြုရန်:** UI ကနေ ဖန်တီးလိုက်တဲ့ permission key က သူ့ဘာသာ ဘယ် route ကိုမှ မပိတ်ဘူး — ဘယ် route က `@RequirePermissions('အဲဒီ key')` ဆိုပြီး မစစ်မချင်း။ Key ဖန်တီးတာက grantable/assignable ဖြစ်အောင်ပဲ၊ route ကစစ်မှ စတင်အကျိုးသက်ရောက်တယ်။

---

## 6. API — Frontend ကနေ ဘယ်လိုသုံးမလဲ

အားလုံး `/api/v1` အောက်မှာ၊ `Authorization: Bearer <token>` လိုပါတယ်။ **role တွေကို `roleId` (uuid) နဲ့** ရည်ညွှန်းပါတယ် (role name မဟုတ်ဘူး)။

| Endpoint | ရည်ရွယ်ချက် | သုံးခွင့် |
|----------|--------------|-----------|
| `POST /auth/login` | token + user + **permissions[]** ရယူ | public |
| `GET /auth/me` | session restore — user + **permissions[]** | authenticated |
| `POST /auth/change-password` | password ပြောင်း (ဟောင်းတဲ့ token အားလုံး invalid) | authenticated |
| `GET /users` | user စာရင်း (`search`, `roleId`, `status`, `page`, `perPage`) | `users.list` |
| `POST /users` | user အသစ် (**roleId**) | `users.create` |
| `GET /users/:id` | user တစ်ယောက်ချင်း | `users.read` |
| `PATCH /users/:id` | user ပြုပြင် (**roleId** assign/ပြောင်း) | `users.update` |
| `DELETE /users/:id` | user ဖျက် | `users.delete` |
| `GET /roles` | role စာရင်း (name, description, isSystem, userCount) | `roles.list` |
| `GET /roles/:id` | role တစ်ခုချင်း | `roles.read` |
| `POST /roles` | role အသစ် `{ name, description }` | `roles.create` |
| `PATCH /roles/:id` | role description ပြောင်း | `roles.update` |
| `DELETE /roles/:id` | role ဖျက် (assign ရှိရင် 409) | `roles.delete` |
| `GET /permissions` | catalog — `[{ domain, permissions: [keys] }]` | `permissions.read` |
| `POST /permissions` | catalog permission အသစ် `{ name, description? }` | `permissions.create` |
| `DELETE /permissions/:name` | permission ဖျက် (grant ရှိရင် 409) | `permissions.delete` |
| `GET /permissions/roles/:roleId` | role တစ်ခု၏ လက်ရှိ grant keys | `permissions.read` |
| `PUT /permissions/roles/:roleId` | role grant set **အစားထိုး** `{ permissions: [keys] }` | `permissions.manage` (+ scope) |

**login/me ထဲက `permissions: string[]` က UI အတွက် အက်ကောင်းဆုံး:** frontend က ဒီ array ကို ကြည့်ပြီး — မရှိတဲ့ permission အတွက် button ကို ဖျောက်တယ်၊ route ကို 403 ပြတယ်။ Backend က 403 ပြန်တာကို စောင့်စရာမလို။

---

## 7. Seed ပုံစံ (Default Catalogs + Grants)

**Catalog — ၁၄ ခု (UI မှာ dot ရှေ့ဆက်နဲ့ အုပ်စုဖွဲ့ပြသ):**
```
users.create  users.list  users.read  users.update  users.delete
permissions.read  permissions.create  permissions.manage  permissions.delete
roles.create  roles.list  roles.read  roles.update  roles.delete
```

**Roles: `OWNER`(is_system=true) + `ADMIN`/`OFFICER`/`RIDER`(is_system=false)**

| Role | Grants |
|------|--------|
| `OWNER` | (system) — catalog အားလုံး၊ ဇယားနဲ့ မဆိုင်ဘူး |
| `ADMIN` | catalog ၁၄ ခုလုံး (roles + users + permissions အားလုံး) |
| `OFFICER` | `users.read` |
| `RIDER` | (ဘာမှမရှိ) |

> မှတ်ချက်: grant ကို UI/API ကနေ ပြောင်းရင် `role_permissions` ဇယားကို ထိပါတယ် — **next login/me ရဲ့ `permissions[]` နဲ့ guard စစ်ဆေးမှုမှာ ချက်ချင်းထင်ဟပ်သည်** (cache 60s TTL, grant write လုပ်လျှင် bust)။ system role(OWNER) က catalog ကိုပဲ ကြည့်လို့ key အသစ်ဖန်တီးတာနဲ့ OWNER မှာ ချက်ချင်းထင်ဟပ်သည်။

---

## 8. ဘာတွေကို UI/API ကနေ လုပ်လို့ရ/မရ

**လုပ်လို့ရ (အပြည့်အဝ dynamic):**
- ✔ User ဖန်တီး/ဖျက်/ပြုပြင် (role assign/ပြောင်း)
- ✔ Role ဖန်တီး/ဖျက်/ပြုပြင် (name/description)
- ✔ Permission key ဖန်တီး/ဖျက် (catalog)
- ✔ Role တစ်ခုရဲ့ permission grant set ပြုပြင်

**သတိထားရမယ့် အချက်နှစ်ခု:**
- ✖ **Permission key ဖန်တီးရုံနဲ့ ဘယ် route ကိုမှ မပိတ်ဘူး** — route တစ်ခုက `@RequirePermissions('အဲဒီ key')` မစစ်မချင်း (key = grantable ဖြစ်အောင်သာ)။ ဒါ spatie မှာလည်း အတူတူပဲ — gate က code/route မှာ ဖြစ်ပြီး၊ data မှာ မဟုတ်ဘူး။
- ✖ per-user override မရှိ — grant တွေ role-level ပဲ။