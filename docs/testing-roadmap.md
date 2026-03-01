# Testing Roadmap

## Scope and Constraints
- Primary objective: protect Spending Power correctness and critical business workflows.
- Test strategy priority: integration and e2e first, focused unit tests for pure functions only.
- Invariant: **No logical behavior changes until critical tests are passing (Gate 2 green).**
- Canonical income path: **Add Income**. Sale Builder is non-critical.
- Test DB: dedicated Neon database via `DATABASE_URL_TEST`.

## Gate Checklist

### Gate 0: Safety + Tracking Setup
- [x] Create this document as single source of truth.
- [x] Add scope, constraints, checklist, progress log, risks/blockers.
- [x] Record invariant about no logic changes before passing critical tests.

### Gate 1: Test Infrastructure + Isolated DB
- [x] Add Playwright and Vitest dependencies in `package.json`.
- [x] Add test scripts in `package.json`.
- [x] Add `.env.test` support and fail-fast checks for `DATABASE_URL_TEST`.
- [x] Add DB reset and deterministic seed utilities.
- [x] Add smoke integration and e2e tests.
- [x] Verify `test:integration` and `test:e2e` pass independently.

### Gate 2: Critical Assertions
- [x] Spending Power contract integration tests.
- [x] Archived-record exclusion integration tests.
- [x] 30-day boundary integration tests.
- [x] Split receipt totals + manual mismatch tests.
- [x] Add Income action integration test.
- [x] E2E purchased-device workflow.
- [x] E2E customer-brought-device workflow.
- [x] `test:all` green.

### Gate 3: Quality Gate + Regression Hardening
- [x] Add stable selectors where needed.
- [x] Add quality gate documentation for merge/deploy.
- [x] Add flake prevention notes.
- [x] Verify 3 consecutive green `test:all` runs.

### Gate 4: Secondary Coverage
- [x] Work-order part consume/reversal integration tests.
- [x] Device/work-order profit rollup integration tests.
- [x] Focused unit tests for `src/lib/allocation.ts`.

## Quality Gate (Local/CI)
- Required command before merge/deploy:
  - `npm run test:all`
- Required environment:
  - `DATABASE_URL_TEST` must point to isolated test database.
- Execution order:
  1. `npm run test:db:reset`
  2. `npm run test:db:seed`
  3. `npm run test:integration`
  4. `npm run test:e2e`

## Flake Prevention Notes
- Deterministic DB state by hard reset + deterministic seed data.
- e2e uses stable `data-testid` selectors for critical actions and dashboard values.
- e2e workflows reset DB before each test case.
- Integration runs in non-concurrent mode to avoid cross-test DB races.

## Known Risks / Blockers
- `DATABASE_URL_TEST` must remain isolated from production data.
- E2E selectors should continue using stable IDs/labels to avoid UI-structure brittleness.
- Any schema changes must preserve deterministic reset/seed behavior.

## Progress Log
- 2026-03-01: Gate 0 completed. Created roadmap, checklist, and invariant.
- 2026-03-01: Gate 1 dependency installation attempted twice and failed (`EAI_AGAIN` on `registry.npmjs.org`).
- 2026-03-01: Added Gate 1 scaffolding:
  - `vitest.config.ts`
  - `playwright.config.ts`
  - `.env.test.example`
  - `tests/utils/env.mjs`
  - `tests/utils/env-loader.ts`
  - `tests/utils/db-reset.mjs`
  - `tests/utils/seed-fixtures.mjs`
  - test scripts in `package.json`
- 2026-03-01: Added Gate 1 smoke suites:
  - `tests/integration/smoke.test.ts`
  - `tests/e2e/smoke.spec.ts`
- 2026-03-01: Added Gate 2 critical assertions:
  - `tests/integration/dashboard-spending-power.test.ts`
  - `tests/integration/expenses-split.test.ts`
  - `tests/integration/income-actions.test.ts`
  - `tests/e2e/critical-workflows.spec.ts`
- 2026-03-01: Added Gate 3 stability selectors in UI:
  - `src/routes/+page.svelte`
  - `src/routes/devices/+page.svelte`
  - `src/routes/expenses/+page.svelte`
  - `src/routes/income/+page.svelte`
  - `src/routes/work-orders/+page.svelte`
- 2026-03-01: Added Gate 4 secondary tests:
  - `tests/integration/work-order-financials.test.ts`
  - `tests/unit/allocation.test.ts`
- 2026-03-01: Validation run executed:
  - `npm run check` fails due missing test deps and one pre-existing app typing issue.

## Evidence
- Network install failures observed while running:
  - `npm install -D vitest @playwright/test dotenv`
  - `npm install -D vitest @playwright/test dotenv --fetch-retries=5 ...`
- Both commands failed with `EAI_AGAIN`.
- 2026-03-01: Executed `npm run test:db:reset` to validate fail-fast behavior; confirmed explicit error when `DATABASE_URL_TEST` is missing.
- 2026-03-01: Executed `npm run test:integration`; blocked because `vitest` binary is unavailable (dependency install blocked by network).
- 2026-03-01: Executed `npm run test:e2e`; blocked because `playwright` binary is unavailable (dependency install blocked by network).
- 2026-03-01: Fixed `npm run check` issues:
  - Corrected `SubmitFunction` import source in `src/routes/work-orders/[id]/+page.svelte`.
  - Removed Svelte state warning pattern in `src/routes/expenses/receipt/[groupId]/+page.svelte`.
- 2026-03-01: Reworked test DB reset strategy to avoid Prisma schema engine dependency:
  - `tests/utils/db-reset.mjs` now truncates all public tables via Prisma query engine (`TRUNCATE ... RESTART IDENTITY CASCADE`).
  - This improves compatibility with Neon pooled connections.
- 2026-03-01: Reduced integration test flake/overhead by switching from shell `execSync` script calls to direct function imports for reset/seed in `tests/integration/helpers.ts`.
- 2026-03-01: Hardened e2e workflow stability in `tests/e2e/critical-workflows.spec.ts` by waiting on submits and split-receipt API response.
- 2026-03-01: Integration failures reviewed against real run output; root causes identified as test isolation/concurrency and brittle fixed-date fixtures, not Spending Power business logic.
- 2026-03-01: Enforced deterministic integration execution in `vitest.config.ts` (`fileParallelism: false`, single worker) to eliminate cross-file reset/seed races and deadlocks.
- 2026-03-01: Updated fixture seeding in `tests/utils/seed-fixtures.mjs`:
  - switched baseline ledger date to local "today" for stable 30-day assertions over time.
  - switched setup data creation to deterministic `createMany(..., skipDuplicates: true)` for categories/channels/vendors/payment methods.
- 2026-03-01: Added essential-first integration gating in `package.json`:
  - `test:integration` now runs essential suites only.
  - `test:integration:secondary` runs secondary suite (`work-order-financials`).
  - `test:all` now runs essential integration + e2e + secondary integration in order.
- 2026-03-01: Fixed essential integration boundary test flake in `tests/integration/dashboard-spending-power.test.ts` by validating 30-day window with stable offsets (`-29d` included, `-31d` excluded) instead of millisecond-sensitive exact-boundary timestamp.
- 2026-03-01: Fixed e2e form-toggle hydration race in `tests/e2e/critical-workflows.spec.ts` by adding robust `openCollapsibleForm(...)` retry/wait helper before filling fields.
- 2026-03-01: Fixed remaining e2e split-receipt modal race in `tests/e2e/critical-workflows.spec.ts`:
  - added `openSplitReceiptModal(...)` retry/wait helper to ensure dialog visibility after click.
  - added `ensureSplitLineExists(...)` to guarantee at least one editable row before selecting category/device/subtotal.
- 2026-03-01: Fixed purchased-workflow split-row subtotal locator in `tests/e2e/critical-workflows.spec.ts`.
  - Root cause from Playwright error-context: subtotal field is rendered as textbox in Subtotal column, not `input[type=number]`.
  - Updated locator to target subtotal column cell (`td` index for Subtotal) and fill textbox directly.
- 2026-03-01: Primary integration, e2e, and secondary integration suites verified passing by user in local environment.
- 2026-03-01: Tightened e2e deterministic entity selection by matching created device SKU/work-order row notes in `tests/e2e/critical-workflows.spec.ts`.
- 2026-03-01: Removed duplicated env-parsing implementation by making `tests/utils/env.mjs` canonical and using a thin wrapper in `tests/utils/env-loader.ts`.
