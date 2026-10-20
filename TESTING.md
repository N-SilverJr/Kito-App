# Testing

Testing is part of the build, not an afterthought. All suites run with `vitest`
(core + server + web) and Playwright for browser journeys.

## Commands

```bash
npm install
npm run build:packages   # shared packages must be built before tests
npm test                 # core + server + web unit/integration tests
npm run test:e2e         # Playwright journeys against a real server
npm run typecheck
npm run lint
npm run build
```

`npm test` does not require network access or any API key. External providers
(Open Food Facts, vision models) are replaced with injected fetch fakes in tests.

## Unit tests — `packages/core/src/core.test.ts`

Covers:
- per-100 g scaling, multi-component summation, single-rounding rules, fiber handling
- macro-implied calorie drift and progress clamping
- gram resolution (exact vs household units), refusing to invent conversions
- kg/lb conversion and range validation
- timezone day keys, DST transitions (America/New_York), half-hour offsets (Asia/Kathmandu),
  date-key arithmetic and validation
- Mifflin–St Jeor goals, deficit caps, intake floor, under-18 safeguards
- deterministic reward keys, level thresholds, accessory unlocks, streaks, achievements
- companion dialogue safety filter
- Zod schemas for meals, onboarding, per-100 g data, AI output coercion

## Integration tests — `apps/server/src/app.test.ts`

Run against an in-memory SQLite database built by the real migrations and a real
Fastify instance (`app.inject`), so routing, auth, validation and SQL are exercised.

Journeys:
1. Register → auto session → onboarding → goals → empty dashboard
2. Catalog meal creation recomputes nutrition server-side (ignores tampered client values)
3. Dashboard totals/macros/water reflect persisted entries for the local date
4. Idempotency key replays return the same meal; only one row exists
5. Second user cannot read/update/delete the first user's meal, water, weight, fast, plan
6. Hydration goal XP granted exactly once per local day
7. Weight entry updates profile weight; stats derive averages from stored rows
8. Fasting session survives a full app restart (new app instance, same database file)
9. AI: unconfigured → 503 with `AI_NOT_CONFIGURED`; mocked valid response → normalized
   items with catalog values; invalid JSON → 502 `AI_INVALID_RESPONSE`
10. Auth: wrong password, password reset token flow, email verification, session revocation
11. Data export contains only the caller's data; account deletion cascades and login fails
12. External food search uses the injected fake and degrades gracefully when it fails
13. Meal plan generation respects vegetarian + allergy filters and builds a shopping list
14. Photo payload validation rejects unsupported MIME types and oversized images

## End-to-end tests — `e2e/`

Playwright drives Chromium against the real web app and real API. `playwright.config.ts`
starts `npm run dev` unless a server is already answering on `:8787`
(`reuseExistingServer`), so the same command works locally and in CI. No mocks: data goes
through the actual Fastify routes into a real SQLite database, and each run creates its own
throwaway accounts.

```bash
npx playwright install chromium   # once
npm run test:e2e
E2E_BASE_URL=http://localhost:5173 npx playwright test   # against an already-running server
```

Eleven journeys, run with one worker so they cannot interleave writes:

1. Register through the form → complete all four onboarding steps → dashboard shows real targets
2. Sign out and back in → previously logged meal is still there
3. Manual meal updates today's totals, survives a reload, and is re-edited to a new portion
4. A forced network failure (POST `/api/meals` aborted) keeps the tray, shows a friendly
   message, and the retry creates **exactly one** meal
5. Water quick-adds and a weight check-in persist across a reload
6. Fasting start → reload → timer still derives from the stored start time → cancel flow
7. A real meal grants XP and the "First bite" achievement; wardrobe shows unlock states
8. A second account gets 404 for another user's meal and an empty export
9. –11. No horizontal overflow on 375 px, 820 px and 1440 px across all nine app screens
12. The scan screen reports the missing-provider state (and the setup steps) instead of failing silently

### Photo-analysis journey (`e2e/ai-scan.spec.ts`, opt-in)

Gated behind `E2E_AI_ENABLED=1` because it needs a configured provider. With
`node scripts/ai-stub.mjs` running and the API pointed at it
(`AI_PROVIDER=openai OPENAI_API_KEY=stub OPENAI_BASE_URL=http://localhost:8899/v1`), the suite
uploads a photo drawn in the browser, waits for the review screen, checks that both components
arrive separately with confidence and portion caveats, edits one portion from 200 g to 100 g,
saves, and asserts the stored meal has `source: "ai"`, two items and the edited weight.

```bash
node scripts/ai-stub.mjs &
(cd apps/server && AI_PROVIDER=openai OPENAI_API_KEY=stub \
  OPENAI_BASE_URL=http://localhost:8899/v1 OPENAI_MODEL=stub-vision PORT=8789 \
  SERVE_WEB=true DATABASE_PATH=./data/e2e-ai.db node dist/index.js &
E2E_BASE_URL=http://localhost:8789 E2E_AI_ENABLED=1 npx playwright test e2e/ai-scan.spec.ts
```

That run also exercises the production build served by the API (single-origin, real cookies).
The stub is a test double — it proves the pipeline, not the model's accuracy.

Screenshots for the docs are generated with `node scripts/screenshots.mjs` against a
running dev server.

## Results in this workspace (Node 22.14, Windows)

| Suite | Tests | Result |
| --- | --- | --- |
| `@nutripals/core` | 31 | passed |
| `@nutripals/server` | 16 | passed |
| `@nutripals/web` | 24 | passed |
| Playwright `e2e/` | 12 | passed (13th is the opt-in AI test, skipped without a provider) |
| Playwright `e2e/ai-scan.spec.ts` | 1 (+1 skipped) | passed against the local AI stub, on a production build served by the API |

`npm run typecheck`, `npm run lint` and `npm run build` all exit 0.

## What is deliberately not covered by automation

- Real vision-model accuracy or cost (needs a paid key; not assertable).
- Real email delivery (no provider is configured; tokens are logged in development).
- Native Android/iOS builds (no native target in this workspace).
- Browser notification delivery (timing/OS dependent); the scheduling code is unit-tested
  for quiet hours where possible.
