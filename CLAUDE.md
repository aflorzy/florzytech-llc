# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev                        # Start dev server (vite)
npm run build                      # Production build
npm run check                      # Svelte type-check

# Prisma
npm run prisma:generate            # Regenerate Prisma client after schema changes
npm run prisma:migrate             # Run migrations (prompts for name)
npm run prisma:seed                # Seed reference data (categories, channels, vendors, payment methods)

# Testing
npm run test:setup                 # Reset and seed the test DB (run before first test run)
npm run test:integration           # Primary integration tests (vitest, hits real test DB)
npm run test:integration:secondary # Secondary integration tests (work order financials)
npm run test:e2e                   # E2E tests (Playwright, spins up dev server on port 4173)
npm run test:all                   # All of the above

# Run a single integration test file
npx vitest run --config vitest.config.ts tests/integration/<file>.test.ts
```

## Environment

- `.env` — production/dev DB (`DATABASE_URL`)
- `.env.test` — test DB (`DATABASE_URL_TEST`). Required for all test runs. Copy from `.env.test.example`.
- Integration tests override `DATABASE_URL` with `DATABASE_URL_TEST` at setup time (`tests/utils/env.mjs`).
- E2E tests use `DATABASE_URL_TEST` via the Playwright `webServer.env` config.
- `DATABASE_URL` must include `sslmode=require` (Neon Postgres).

## Architecture

**Stack:** SvelteKit (Svelte 5 runes) + Tailwind CSS + Prisma ORM + Neon Postgres. Deployed via `@sveltejs/adapter-node`.

**Data layer:** Single Prisma client singleton at `src/lib/server/prisma.ts`, imported across all `+page.server.ts` files. All monetary values are stored as **integer cents** — never floats. Soft deletes via `archivedAt: DateTime?`; all queries filter `archivedAt: null`.

**Route pattern:** Each feature area is a SvelteKit route under `src/routes/`. The `+page.server.ts` exports a `load` function (fetches data + reference lists) and an `actions` object (form actions for create/update/delete/archive). There is no separate API layer — the page server files are the backend.

**Key domain models (prisma/schema.prisma):**
- `Device` — inventory item with a SKU (`FZ-YYYYMM-BBB-NNN`), status enum, and purchase price.
- `Expense` — purchase/cost entry; supports split receipts via `splitGroupId` + `AllocationMethod`.
- `Income` — sale/service entry with platform/payment/shipping/tax fee fields; has `IncomeLine[]` for multi-item sales.
- `WorkOrder` — repair job linking a `Customer`, one or more `Device`s (`WorkOrderDevice`), and line items (`WorkOrderItem` of type PART/LABOR/NOTE).
- `Part` — inventory with average costing via `PartInventoryMovement` (RECEIPT/CONSUME/ADJUSTMENT).

**Utility modules:**
- `src/lib/sku.ts` — SKU generation (`buildSku`, `brandCode`).
- `src/lib/allocation.ts` — split-receipt cost allocation across lines (PROPORTIONAL_SUBTOTAL, EVEN, MANUAL).

**Testing strategy:**
- Integration tests (`tests/integration/`) run against a real test DB via vitest. Fully sequential (`fileParallelism: false`). Each test calls `resetAndSeedDb()` via `tests/integration/helpers.ts` in `beforeEach`.
- E2E tests (`tests/e2e/`) use Playwright against the dev server; global setup in `tests/e2e/global-setup.ts`.
- Unit tests live in `tests/unit/` (currently sparse).
- Fixtures and DB reset scripts: `tests/utils/seed-fixtures.mjs`, `tests/utils/db-reset.mjs`.
