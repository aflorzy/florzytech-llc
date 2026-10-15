import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';

// Database connectivity probe for manual checks and deploy scripts. NOT for the container
// HEALTHCHECK (see /livez): polling this wakes the Neon compute and keeps it from scaling to zero.
export const GET: RequestHandler = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ status: 'error', error: 'database unreachable' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
};
