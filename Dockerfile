# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install OpenSSL so Prisma can detect libssl version and run reliably
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies (including devDependencies for the build and the Prisma CLI)
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
# --ignore-scripts: the postinstall hook (svelte-kit sync) needs the full source tree
RUN npm ci --ignore-scripts && npx prisma generate

# Build the SvelteKit app (adapter-node output in /app/build)
FROM deps AS build
COPY . .
RUN npm run build

# Production runtime image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# node_modules keeps the Prisma CLI so `prisma migrate deploy` can run at startup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz',res=>{ process.exit(res.statusCode===200?0:1) }).on('error',()=>process.exit(1))"

# Run migrations on container start. Disable by setting RUN_MIGRATIONS=false
ENV RUN_MIGRATIONS=true

# Required runtime envs:
# - DATABASE_URL (Neon, with sslmode=require)
# - ORIGIN (public URL of the app, e.g. http://docker.lan:3009; SvelteKit rejects form posts without it)
# Optional: SKU_PREFIX, TZ

# A failed migration stops the container instead of serving on a mismatched schema.
CMD ["bash", "-c", "if [ \"$RUN_MIGRATIONS\" != \"false\" ]; then npx prisma migrate deploy || exit 1; fi; exec node build"]
