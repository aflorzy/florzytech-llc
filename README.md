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
npm run test:unit           # Unit tests (no DB access)
npm run test:integration    # Integration tests (vitest, hits real test DB)
npm run test:e2e            # E2E tests (Playwright)
npm run test:all            # All tests
```

### Testing against a copy of real data

`npm run test:snapshot:export` reads the app database from `.env` inside a read-only transaction and writes an anonymized copy (no names, contact details, notes, serials or order numbers) to `tests/fixtures/prod-snapshot.json`, along with dashboard totals computed in SQL. When that file exists, `tests/integration/prod-snapshot.test.ts` checks that the dashboard reproduces those totals, and that re-entering every income and expense through the app's actions lands on the same numbers. The file is gitignored by default; remove the ignore line to commit it so CI runs the suite too.

## Docker and deployment

```bash
docker build -t florzytech-tracker .
docker run -p 3000:3000 -e DATABASE_URL=... -e ORIGIN=http://localhost:3000 florzytech-tracker
```

- `ORIGIN` must be the URL the app is reached at, or SvelteKit rejects form posts.
- The container runs `prisma migrate deploy` on start and exits if a migration fails. Set `RUN_MIGRATIONS=false` to skip.
- `GET /healthz` returns 200 when the app can reach the database.

CI (`.gitea/workflows/ci.yml`): every PR to `master` runs type-check, build, unit, integration and e2e tests and a Docker build. A push to `master` reruns the tests, pushes `tracker:latest` and `tracker:<sha>.<run>` to the registry, and calls the staging deploy webhook. Production is deployed by pinning an image tag in the `app-deployments` repo (`apps/florzytech-tracker`).

## Notes

- Amounts are stored as integer cents.
- Timezone defaults to America/Chicago.
- SKU format: `FZ-YYYYMM-BBB-NNN` (prefix configurable via `SKU_PREFIX`).

## Roadmap

See `FUTURE_FEATURES.md`.
