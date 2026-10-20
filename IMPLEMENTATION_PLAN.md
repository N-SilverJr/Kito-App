# NutriPals — Implementation Plan & Acceptance Checklist

Status legend: ✅ implemented and verified · 🟡 implemented, partially verified · ⚪ not implemented (disclosed).

_Last updated during the build in this workspace. Verification evidence: see TESTING.md._

## Phase 1 — Foundation

| # | Item | Status |
|---|------|--------|
| 1.1 | Monorepo with shared `core` + `api-client`, strict TypeScript | ✅ |
| 1.2 | Design tokens, light/dark/system theme, reduced-motion support | ✅ |
| 1.3 | Responsive navigation (bottom bar / rail, sidebar) | ✅ |
| 1.4 | SQLite schema + migration runner + seed catalog | ✅ |
| 1.5 | Password auth, hashed server sessions, verification + reset tokens | ✅ |
| 1.6 | Ownership-scoped data access + cross-user isolation tests | ✅ |
| 1.7 | Rate limits, origin checks, input validation, secure cookies | ✅ |

## Phase 2 — Core nutrition tracking

| # | Item | Status |
|---|------|--------|
| 2.1 | Onboarding questionnaire + estimated goals with minor safeguards | ✅ |
| 2.2 | Dashboard: calories, macros, remaining, meals, water, next actions | ✅ |
| 2.3 | Local + regional food catalog (~45 items, Kinyarwanda aliases) | ✅ |
| 2.4 | Manual search, custom foods, gram/portion editing | ✅ |
| 2.5 | Meal create/edit/delete with meal types and timestamps | ✅ |
| 2.6 | Tested nutrition engine (scaling, summation, rounding, unit conversions) | ✅ |
| 2.7 | Per-100 g normalization, catalog-sourced recalculation on save | ✅ |
| 2.8 | Text-based logging parser ("2 eggs and 150g rice") | ✅ |
| 2.9 | Barcode lookup via Open Food Facts | ✅ |
| 2.10 | Habit-only mode without calorie targets | ✅ |

## Phase 3 — AI food analysis

| # | Item | Status |
|---|------|--------|
| 3.1 | Camera/gallery/file capture with client-side downscale + MIME/size checks | ✅ |
| 3.2 | Provider adapter: OpenAI, Gemini, Anthropic (configurable, server-side only) | ✅ |
| 3.3 | Zod-validated structured output with one repair retry, timeout, typed errors | ✅ |
| 3.4 | Catalog matching replaces model nutrition where confident | ✅ |
| 3.5 | Editable review screen before saving (rename, portions, add/remove, confidence) | ✅ |
| 3.6 | Honest "not configured" state when no key is present | ✅ |
| 3.7 | Photo never persisted; only structured result + metadata | ✅ |
| 3.8 | Per-user AI rate limit | ✅ |
| 3.9 | End-to-end browser verification of the analysis pipeline | 🟡 Verified against a local OpenAI-compatible stub (`scripts/ai-stub.mjs`, `e2e/ai-scan.spec.ts`); a live vendor model still needs a key |

## Phase 4 — Daily habits

| # | Item | Status |
|---|------|--------|
| 4.1 | Hydration: configurable target, quick adds, custom, edit/delete, history | ✅ |
| 4.2 | Weight: history, chart, notes, edit/delete, target, hideable | ✅ |
| 4.3 | Fasting: 12:12 / 14:10 / 16:8 / custom, persisted timestamps, finish/cancel | ✅ |
| 4.4 | Fasting survives reload/restart (tested with a second app instance on the same DB) | ✅ |
| 4.5 | Manual activity log with optional MET-based burn estimate | ✅ |

## Phase 5 — Companion

| # | Item | Status |
|---|------|--------|
| 5.1 | Original SVG companion (Kito) with 7 expressions | ✅ |
| 5.2 | XP, levels, streaks, achievements, reward history | ✅ |
| 5.3 | Cosmetic unlocks + equipped state persisted server-side | ✅ |
| 5.4 | Deterministic, server-granted rewards with unique event keys (no farming) | ✅ |
| 5.5 | Supportive, non-judgemental dialogue + safety filter | ✅ |
| 5.6 | iOS/Android home-screen install | ✅ (PWA) |

## Phase 6 — Insights & planning

| # | Item | Status |
|---|------|--------|
| 6.1 | Daily/weekly/monthly stats from stored data, accessible chart + data table | ✅ |
| 6.2 | Deterministic weekly meal planner with allergy filtering and shopping list | ✅ |
| 6.3 | Plan editing (titles/ingredients/instructions) | ✅ |
| 6.4 | Regional food catalog + local availability priority | ✅ |
| 6.5 | Native Apple Health / Health Connect | ⚪ Requires native build + platform config |

## Phase 7 — Platform polish

| # | Item | Status |
|---|------|--------|
| 7.1 | PWA manifest, icons, service worker (app shell only) | ✅ |
| 7.2 | In-app reminder settings + browser notification scheduling | 🟡 Browser scheduling only while a tab is open |
| 7.3 | Accessibility: labels, focus states, keyboard nav, chart tables, contrast | ✅ |
| 7.4 | Offline banner, retry, draft preservation, idempotent writes | ✅ |
| 7.5 | Performance: code-split routes, image downscale, indexed queries | ✅ |
| 7.6 | Android/iOS native binaries | ⚪ Not built in this environment; see README limitations |

## Phase 8 — QA & release

| # | Item | Status |
|---|------|--------|
| 8.1 | Core unit tests | ✅ |
| 8.2 | Server integration tests (auth, isolation, idempotency, AI failures, export/delete) | ✅ |
| 8.3 | Playwright E2E journeys | ✅ (see TESTING.md) |
| 8.4 | Lint, typecheck, production builds | ✅ |
| 8.5 | Deployment guide + env documentation | ✅ |
| 8.6 | Google/Apple sign-in | ⚪ Not implemented (requires provider configuration) |
| 8.7 | Subscriptions / billing | ⚪ Intentionally deferred |

## Definition-of-done review

| Requirement | Status |
|---|---|
| Original brand and polished responsive UI | ✅ |
| Auth + onboarding + persistent user data | ✅ |
| Tested nutrition calculations | ✅ |
| Manual logging + editable meals | ✅ |
| AI photo analysis with real provider adapter, editable results | ✅ adapter verified with mocks, ⚪ without a live key |
| Regional foods + custom foods | ✅ |
| Hydration, weight, fasting persistence | ✅ |
| Companion reacts to real events; rewards cannot be trivially duplicated | ✅ |
| Stats derived from real data | ✅ |
| No cross-user data access | ✅ tested per resource |
| Tests, typecheck, lint, build pass | ✅ |
| Deployment + env documentation | ✅ |
| Limitations disclosed | ✅ README |
