import type { RequestHandler } from './$types';

// Process liveness only. Deliberately does not touch the database: the container HEALTHCHECK polls
// this every 30s, and a DB query on that cadence keeps the Neon compute awake 24/7 and burns the
// free-plan CU-hours. Use /healthz when you actually need to know the database is reachable.
export const GET: RequestHandler = () =>
  new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
