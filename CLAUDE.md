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
npm run test:unit                  # Unit tests (pure functions, no DB access)
npm run test:integration           # All integration tests (vitest, hits real test DB)
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
- The test env loader refuses to run if `DATABASE_URL_TEST` is the same database as `DATABASE_URL` in `.env` (tests truncate every table).
- CI: `.gitea/workflows/ci.yml` runs check, build, unit, integration, e2e and a Docker build on PRs to `master` (needs the `DATABASE_URL_TEST` repo secret); pushes to `master` also push the image and trigger the staging deploy webhook.
- Docker: `Dockerfile` builds the adapter-node output; runtime needs `DATABASE_URL` and `ORIGIN`. `GET /healthz` is the health probe. Deployment config lives in the `app-deployments` repo under `apps/florzytech-tracker`.
- `npm run test:snapshot:export` writes an anonymized read-only copy of the `.env` database to `tests/fixtures/prod-snapshot.json` (gitignored); `prod-snapshot.test.ts` is skipped when the file is absent.

## Architecture

**Stack:** SvelteKit (Svelte 5 runes) + Tailwind CSS + Prisma ORM + Neon Postgres. Deployed via `@sveltejs/adapter-node`.

**Data layer:** Single Prisma client singleton at `src/lib/server/prisma.ts`, imported across all `+page.server.ts` files. All monetary values are stored as **integer cents** — never floats. Soft deletes via `archivedAt: DateTime?`; all queries filter `archivedAt: null`.

**Route pattern:** Each feature area is a SvelteKit route under `src/routes/`. The `+page.server.ts` exports a `load` function (fetches data + reference lists) and an `actions` object (form actions for create/update/delete/archive). There is no separate API layer — the page server files are the backend.

**Key domain models (prisma/schema.prisma):**
- `Device` — inventory item with a SKU (`FZ-YYYYMM-BBB-NNN`), status enum, and purchase price.
- `Expense` — purchase/cost entry; supports split receipts via `splitGroupId` + `AllocationMethod`.
- `Income` — sale/service entry with platform/payment/shipping/tax fee fields; has `IncomeLine[]` for multi-item sales.
- `WorkOrder` — repair job linking a `Customer`, one or more `Device`s (`WorkOrderDevice`), and line items (`WorkOrderItem` of type PART/LABOR/NOTE). A device can be on several work orders; `WorkOrderDevice.includeDeviceCost` marks the one work order its expenses count against (never a `DONOR` row). Every line has a customer price: `WorkOrderItem.manualUnitPriceCents` (PART, else the parts markup), `amountCents` (LABOR), `WorkOrderDevice.priceCents`. `invoicedAt` + `invoicedMarkupBps` freeze the markup once the first income is recorded against the work order or "Mark invoiced" is used; `invoicedAt` with no stored markup means invoiced before prices existed (parts unpriced).
- `Settings` — single row (id 1) of app-wide settings; currently `partsMarkupBps` (basis points, default 3000).
- `Part` — inventory with average costing via `PartInventoryMovement` (RECEIPT/CONSUME/ADJUSTMENT). A RECEIPT with `sourceDeviceId` is a part harvested from a donor device (`DeviceStatus.DONOR`); its value comes off the donor's cost and is charged to whichever work order consumes the part.

**Utility modules:**
- `src/lib/sku.ts` — SKU generation (`buildSku`, `brandCode`).
- `src/lib/allocation.ts` — split-receipt cost allocation across lines (PROPORTIONAL_SUBTOTAL, EVEN, MANUAL).
- `src/lib/parts.ts` — `effectiveUnitCostCents`: a part's `averageCostCents` once it has been received through a receipt, else the hand-entered `unitCostCents`. Use it wherever stock is valued.
- `src/lib/pricing.ts` — the one place prices are rounded: `defaultUnitPriceCents` (cost plus markup per unit, half a cent up), `partLinePrice`, `impliedMarkupPercent`, and the string parsers `parseUsdToCents` / `parsePercentToBps`. Integer cents and basis points only.
- `src/lib/server/work-order-pricing.ts` — reads and writes the parts markup setting, `markWorkOrdersInvoiced` (call it inside the transaction of anything that records or re-points an income), and `loadReceivedCents`.
- `src/lib/server/device-financials.ts` — per-device income, expenses, parts used and net, shared by the Devices list and detail pages. Sale Builder sales are counted through their `IncomeLine`s (the head is skipped when it has device lines); expenses received into parts stock are left out and charged as parts used when consumed on a work order. Value harvested from a donor into stock is taken off its expenses the same way (`unharvestedExpensesCents`), on the device pages and in work-order profit.

**Guide (keep it current):** `src/lib/guide.ts` describes how the app behaves today, as the real scenarios it is used for (buy and resell, customer repair, donor, accessory, buying parts, recording income) and how each headline figure is worked out. It is the single source for the in-app Guide page (`/guide`) and the first thing to read before touching money logic. Any change that alters what a user does or how a figure is calculated must update the matching entry in the same change. It documents current behaviour only; planned work belongs in Gitea issues.

**Design system:** all styling goes through tokens and shared pieces; do not hand-write colours, radii or one-off button/input classes in pages.
- Tokens: `src/app.css` (`--c-*` colour channels for light and dark, `--radius-*`, `--shadow-*`), exposed in `tailwind.config.ts` as `bg-surface`, `bg-raised`, `text-ink`, `text-muted`, `border-line`, `bg-accent`, `text-gain`, `text-loss`, `rounded-control`, `rounded-card`, etc. Never use raw palette classes (`zinc-*`, `blue-600`, ...).
- Component classes (`src/app.css`, `@layer components`): `.btn` + `.btn-primary|secondary|ghost|danger` (+ `.btn-sm`), `.icon-btn` (+ `.icon-btn-danger`), `.label`, `.input` (+ `.input-sm`), `.hint`, `.card`, `.card-title`, `.form-panel`, `.table-wrap` > `table.data-table` (`.edit-row`, `.empty-cell`), `.link`, `.figure`, `.total-box`, `.alert-error`. One `.btn-primary` (amber) per view.
- Svelte components (`src/lib/components/`): `PageHeader` (title, `back`, `meta`/`actions` snippets), `StatCard`, `BalanceCard` (balance plus money in/out bars), `Modal`, `Badge`, `StatusBadge` (enum to tone + label), `SkuTag`, `DateRangeFilter`, `Icon` (add new paths there, no inline SVG).
- Logo: `static/favicon.svg` (the laptop mark on a dark tile) is both the tab icon and the sidebar mark.
- `src/lib/format.ts`: `formatUsd(cents)`, `toneOf`/`toneClass` for signed amounts, `humanizeEnum`.
- Fonts are self-hosted via `@fontsource` (Barlow for text, Barlow Semi Condensed for headings and figures).

**Testing strategy:**
- Integration tests (`tests/integration/`) run against a real test DB via vitest. Fully sequential (`fileParallelism: false`). Each test calls `resetAndSeedDb()` via `tests/integration/helpers.ts` in `beforeEach`.
- E2E tests (`tests/e2e/`) use Playwright against the dev server; global setup in `tests/e2e/global-setup.ts`.
- Unit tests live in `tests/unit/` (currently sparse).
- Fixtures and DB reset scripts: `tests/utils/seed-fixtures.mjs`, `tests/utils/db-reset.mjs`.
