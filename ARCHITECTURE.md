# NutriPals — Architecture

## Product shape

NutriPals is a responsive, installable web application (PWA) backed by an HTTP API.
The same build serves phones (320–430 px), tablets (768–1024 px) and desktops (≥1280 px).
All business rules that affect numbers — nutrition scaling, daily goals, date boundaries,
streak/reward rules, unit conversion — live in one shared TypeScript package used by both
the API and the client, so the two can never disagree about what a day means.

```
Browser (React 19 + Vite, PWA)
        │  typed fetch client (@nutripals/api-client), httpOnly session cookie
        ▼
Fastify API (Node 22)
        │  ownership checks in one data-access layer, Zod validation everywhere
        ▼
SQLite (node:sqlite, WAL)  ── migrations/*.sql
        │
        ├── Open Food Facts (search + barcode, no key)
        ├── USDA FoodData Central (search, optional key)
        └── Vision model adapter (OpenAI / Gemini / Anthropic, optional key)
```

### Why this stack

- **SQLite via `node:sqlite`** removes native build steps and keeps a real relational
  schema, transactions and constraints available on any machine with Node ≥ 22.6.
  The schema is written for PostgreSQL compatibility; the data-access layer is the only
  place that needs changing to move to Postgres.
- **No ORM.** Queries are explicit SQL with bound parameters; this keeps the ownership
  rules visible and auditable in one file per resource.
- **No RLS at the database level.** SQLite has no row-level security. Every request
  resolves the user from a server-side session and every query is scoped by `user_id`
  inside `apps/server/src/repo/*`. Integration tests attack every resource type as a
  second user and expect 404/403. See “Security” below.
- **PWA instead of a native binary** for this build. Camera capture, notifications and
  installability work in supported browsers; native-only capabilities (Health Connect /
  Apple Health, store billing) are not claimed. See README limitations.

## Monorepo layout

```
apps/
  server/        Fastify API, migrations, seed data, AI + food-database adapters
  web/           React app, design system, screens, PWA manifest & service worker
packages/
  core/          Pure TypeScript domain logic + Zod schemas + DTO types (no I/O)
  api-client/    Typed HTTP client
scripts/         Dev orchestrator
e2e/             Playwright journeys
```

`packages/core` has no runtime dependency except Zod and is tested independently.
Both apps import its compiled output, so the browser and server share the exact same
rounding, timezone and reward rules.

## Data model highlights

- Canonical storage units: **grams, millilitres, kilograms, centimetres, kilocalories, UTC ISO timestamps**.
  Display units are derived at render time; changing metric/imperial never rewrites data.
- `foods` stores nutrients **per 100 g**. `food_serving_sizes` stores household conversions
  and whether each conversion is approximate.
- `meal_items` store **portion-scaled** nutrition snapshots plus their source and confidence,
  so historical meals stay stable even if a catalog entry is later corrected.
- Each user-owned row carries `user_id` and a `local_date` computed in the user's timezone at
  write time from the event timestamp. This makes day aggregation a single indexed range scan
  and keeps timezone boundaries correct.
- `habit_events` and `companion_rewards` have unique constraints on deterministic event keys;
  replaying a request cannot farm XP.
- `idempotency_keys` stores the first successful response per `(user_id, key)` for create
  endpoints, so retries return the original record instead of duplicating it.
- Photos are analysed in memory and are **never written to disk or the database**. Only the
  structured result metadata is retained.

## AI pipeline

1. Client validates type + size, downscales to ≤1024 px JPEG with a canvas (≈150–250 KB).
2. Server validates the data URL, enforces a per-user AI rate limit and calls the configured
   provider through one adapter interface (`analyzeFoodImage`).
3. The request asks for JSON matching `aiAnalysisSchema`; responses are parsed with Zod.
   One repair retry is allowed; a second failure returns a typed `AI_INVALID_RESPONSE`.
4. Each detected item is matched against the local catalog (normalised name + aliases +
   region). A confident match replaces model nutrition with catalog values and sets
   `data_source: "catalog"`. Unmatched items remain `ai_estimate` with confidence and
   portion-uncertainty fields intact.
5. The client shows the editable result. Nothing is saved until the user reviews it, and
   the review screen requires a gram weight where the model could not supply one.
6. When no provider is configured the endpoint returns `503 AI_NOT_CONFIGURED`; the UI
   shows setup instructions instead of fake results.

## Security model

- Passwords: scrypt (N=16384) with 16-byte salt, constant-time verification.
- Sessions: 32-byte random token, only its SHA-256 hash is stored; `httpOnly`, `SameSite=Lax`,
  `Secure` in production, 30-day sliding expiry, revocable on logout/password change.
- All mutations require a matching `Origin` when one is sent, plus a JSON content type.
- Every resource route authenticates, then scopes by `user_id`; a foreign id returns 404.
- Zod validates bodies, query strings and model output; unknown fields are stripped.
- Rate limits: global, per-IP auth limits, per-user AI limits.
- Uploads: MIME whitelist, size cap, base64 validation; no filesystem writes.
- Account deletion removes user-owned rows, sessions and custom foods in one transaction.
- No secrets ship to the browser: the client only talks to same-origin `/api`.

## Timezones

Event instants are stored in UTC. The user's IANA timezone is stored in `profiles.timezone`
and can be refreshed from the device in Settings. Local day keys are computed with `Intl`
(`packages/core/src/dates.ts`) at write and query time, including DST transitions and
non-hour offsets. A fasting timer is always rendered from the persisted `started_at`
timestamp, so closing the tab or restarting the device cannot reset it.

## Offline and failure behaviour

- Read views show a retry state on network failure; nothing is silently replaced with zeros.
- Mutations use idempotency keys, disable submit while in flight, and surface failures with a
  retry action. Failed writes are never reported as saved.
- Form drafts (meal being edited, scan review) persist in `sessionStorage` so a reload does
  not discard user input.
- A service worker precaches the app shell for offline start-up; API responses are not
  cached, so offline users see an explicit offline state rather than stale private data.
