# FlorzyTech Tracker

A SvelteKit app for tracking devices, expenses, income, parts, and work orders in an electronics repair/resale workflow.

## Tech

- SvelteKit (Svelte 5 runes) + Tailwind CSS
- Prisma ORM + Neon Postgres
- Vitest (integration) + Playwright (E2E)

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon connection string (requires `sslmode=require`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client and run migrations:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   ```
4. Seed initial data (categories, channels, vendors, payment methods):
   ```bash
   npm run prisma:seed
   ```
5. Start dev server:
   ```bash
   npm run dev
   ```

## Testing

Copy `.env.test.example` to `.env.test` and set `DATABASE_URL_TEST` to a separate Neon database.

```bash
npm run test:setup          # Reset and seed the test DB (run once before first test run)
npm run test:integration    # Integration tests (vitest, hits real test DB)
npm run test:e2e            # E2E tests (Playwright)
npm run test:all            # All tests
```

## Notes

- Amounts are stored as integer cents.
- Timezone defaults to America/Chicago.
- SKU format: `FZ-YYYYMM-BBB-NNN` (prefix configurable via `SKU_PREFIX`).

## Roadmap

See `FUTURE_FEATURES.md`.
