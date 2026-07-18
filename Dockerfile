# syntax=docker/dockerfile:1

# Slim multi-stage build. The runtime image ships a PROD-ONLY node_modules (no devDeps, no tsx,
# no test tooling), the Next build output, the three esbuild-transpiled server entrypoints, and
# the migration SQL. The workers are transpiled (not inlined): deps like jsdom read their own data
# files via __dirname-relative reads, so they must stay in a real node_modules, not a bundle.
# See docs/superpowers/specs/2026-07-07-docker-single-box-deploy-design.md.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- deps: full install (build needs devDeps: next, esbuild, drizzle types) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- prod-deps: production-only tree for the runtime image ---
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# --- build: Next build + transpiled ws/worker/migrate entrypoints ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they must be present
# during `next build`, not only at runtime (F29). Compose passes this as a build arg.
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
# Fail loudly if it is empty: the value is compile-time-inlined, so an empty build bakes a broken
# WS URL into the client bundle (board/inbox/import realtime then throw `new WebSocket("")`), and
# fixing it needs a full rebuild. Better to stop the build than ship a silently-broken bundle.
RUN test -n "$NEXT_PUBLIC_WS_URL" || (echo "ERROR: NEXT_PUBLIC_WS_URL build arg is required (compile-time inlined)" >&2; exit 1)
# `next build` imports server modules that load src/config/env.ts, which validates and throws at
# import. There is no .env in the image, so supply schema-satisfying PLACEHOLDERS just for this
# command (inline on RUN, so they never persist in a layer). Only NEXT_PUBLIC_* is inlined into
# output; these server values are never baked in and are fully overridden by the runtime env_file.
# (TOKEN_ENCRYPTION_KEY here is 32 zero bytes, base64.)
RUN NODE_ENV=production \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    GOOGLE_OAUTH_CLIENT_ID=build \
    GOOGLE_OAUTH_CLIENT_SECRET=build \
    GOOGLE_WORKSPACE_DOMAIN=build.example.com \
    BASE_URL=http://localhost:3000 \
    WS_TICKET_SECRET=build_placeholder_ws_ticket_secret_0123456789 \
    WS_PUBLIC_URL=ws://localhost:8080 \
    MINIO_ENDPOINT=http://localhost:9000 \
    MINIO_ACCESS_KEY=build \
    MINIO_SECRET_KEY=build \
    TOKEN_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    SEED_ADMIN_EMAIL=build@example.com \
    ALLOW_FIRST_LOGIN_ADMIN=false \
    pnpm build:docker

# --- runtime: minimal, non-root ---
FROM base AS runtime
ENV NODE_ENV=production
# Optional version stamp for the update-check banner (e.g. a release tag). When unset, the app
# falls back to the bundled package.json version, then "dev" (banner disabled). Not compile-time
# inlined: it is a server-only runtime env, read via src/config/env.ts.
ARG APP_VERSION=
ENV APP_VERSION=${APP_VERSION}
# `next start` must bind all interfaces (not localhost) to be reachable across the compose
# network / from the Caddy proxy.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
# `next start` writes the fetch/route cache under .next/cache at request time, so this tree must be
# owned by the non-root runtime user or those writes hit EACCES (noisy logs + disabled caching).
COPY --chown=node:node --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json next.config.ts ./
# node:alpine ships an unprivileged `node` user; run as it, not root.
USER node
EXPOSE 3000 8080
# App is the default; compose overrides command per service (ws/worker/migrate).
CMD ["node_modules/.bin/next", "start"]
