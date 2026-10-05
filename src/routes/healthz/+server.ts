import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma';

// Liveness + database connectivity probe for the container healthcheck and deploy scripts.
export const GET: RequestHandler = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ status: 'error', error: 'database unreachable' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
};
