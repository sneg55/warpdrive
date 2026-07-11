# Deploying warpdrive to a single box

warpdrive ships as a self-contained Docker Compose stack: the Next.js app, a WebSocket server, a
background worker, Postgres, MinIO object storage, and a Caddy reverse proxy that terminates TLS
with automatic Let's Encrypt certificates. One `docker compose up -d --build` brings up the whole
thing. Design: `docs/superpowers/specs/2026-07-07-docker-single-box-deploy-design.md`.

## Prerequisites

- A Linux box with Docker and the Compose plugin.
- A domain name with an `A`/`AAAA` record pointing at the box's public IP (needed for TLS and
  because Google OAuth will not redirect to a bare IP).
- A second `A`/`AAAA` record for the `s3.` subdomain (e.g. `s3.crm.example.com`) also pointing at the
  box. The browser uploads files (CSV import, avatars, attachments) directly to MinIO through this
  host, so it needs its own hostname, cert, and `MINIO_ENDPOINT` value.
- Ports 80 and 443 open to the internet (Caddy needs 80 for the ACME challenge).
- A Google OAuth client (Workspace) with the redirect URI set to
  `https://<your-domain>/api/gmail/oauth/callback` and the app's sign-in callback.

## 1. Configure `.env`

```sh
cp .env.example .env
```

Fill it in. The deployment-specific values:

| Var | Value on the box |
| --- | --- |
| `APP_DOMAIN` | `crm.example.com` (the public hostname) |
| `ACME_EMAIL` | an address for Let's Encrypt expiry notices |
| `BASE_URL` | `https://crm.example.com` |
| `NEXT_PUBLIC_WS_URL` | `wss://crm.example.com/_ws` |
| `WS_PUBLIC_URL` | `ws://ws:8080` (internal compose address) |
| `MINIO_ENDPOINT` | `https://s3.crm.example.com` (public: the browser uploads directly here) |
| `DATABASE_URL` | `postgres://warpdrive:warpdrive@postgres:5432/warpdrive` |
| `SEED_ADMIN_EMAIL` | the first admin's email (required in production) |
| `ALLOW_FIRST_LOGIN_ADMIN` | `false` (the env boundary rejects `true` in production) |

Generate the secrets:

```sh
# 32-byte base64 key for token encryption
openssl rand -base64 32          # -> TOKEN_ENCRYPTION_KEY
# a long random string (>= 32 chars) for WS tickets
openssl rand -hex 32             # -> WS_TICKET_SECRET
# MinIO credentials
openssl rand -hex 16             # -> MINIO_ACCESS_KEY / MINIO_SECRET_KEY
```

Hardening: any of `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `WS_TICKET_SECRET`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `MINIO_SECRET_KEY` may instead be supplied as `<VAR>_FILE` pointing
at a file path (Docker secret), and the app reads the file contents at boot.

## 2. Bring it up

```sh
docker compose up -d --build
```

Order is handled automatically: Postgres becomes healthy, `migrate` applies the schema and
`createbuckets` provisions the MinIO bucket, then `app`, `ws`, and `worker` start. Caddy waits for
the app to report healthy, then fetches the TLS cert on first request to `https://<APP_DOMAIN>`.

Check status:

```sh
docker compose ps
curl -fsS https://<APP_DOMAIN>/api/health   # -> {"ok":true}
```

## 3. First admin login

`SEED_ADMIN_EMAIL` is bootstrapped as the initial admin. Sign in with that Google account through
the normal OAuth flow; it is promoted on first login. `ALLOW_FIRST_LOGIN_ADMIN` stays `false` in
production (the env boundary enforces this).

## Operating the box

- **Update to a new version:** `git pull && docker compose up -d --build`. Migrations run
  automatically via the one-shot `migrate` service before the app restarts.
- **Logs:** `docker compose logs -f app` (or `ws` / `worker` / `caddy`).
- **Backups:** the database lives in the `pgdata` volume. Take a dump on a schedule, e.g.
  `docker compose exec -T postgres pg_dump -U warpdrive warpdrive | gzip > backup-$(date +%F).sql.gz`.
  Uploaded files live in the `miniodata` volume; back that up too.
- **Reaching Postgres:** it is intentionally not published to the host in production. Use
  `docker compose exec postgres psql -U warpdrive`. MinIO's S3 API is reachable through Caddy at
  `https://s3.<APP_DOMAIN>` (the browser needs it for presigned uploads); its admin console stays
  internal, so temporarily forward a port to reach that.

## Local development against this stack

The base compose file is production-only (no host ports, TLS via Caddy). For a local run, merge the
dev overrides (which expose host ports and drop Caddy):

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Then the app is at `http://localhost:3000`, MinIO console at `http://localhost:9001`, and Postgres
at `localhost:5433`. Set `BASE_URL=http://localhost:3000` and `NEXT_PUBLIC_WS_URL=ws://localhost:8080`
in `.env` for this mode.
