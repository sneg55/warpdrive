---
sidebar_position: 2
title: Installation
description: "Deploy Warpdrive on a single box with Docker Compose: prerequisites, environment variables, TLS, MinIO storage, Google OAuth, and the first admin login."
---

# Installation

Warpdrive ships as a self-contained Docker Compose stack: the Next.js app, a
WebSocket server, a background worker, Postgres, MinIO object storage, and a Caddy
reverse proxy that terminates TLS with automatic Let's Encrypt certificates. One
`docker compose up -d --build` brings up the whole thing.

## Prerequisites

- A Linux box with Docker and the Compose plugin.
- A domain name with an `A`/`AAAA` record pointing at the box's public IP. This is
  required, not cosmetic: Google OAuth will not redirect to a bare IP address.
- **A second `A`/`AAAA` record for an `s3.` subdomain** (for example
  `s3.crm.example.com`), also pointing at the box. The browser uploads files (CSV
  imports, avatars, attachments) directly to MinIO through this hostname, so it needs
  its own DNS record and certificate. Skipping this breaks every upload.
- Ports 80 and 443 open. Caddy needs port 80 for the ACME challenge.
- A Google OAuth client (Workspace), covered below.

## 1. Configure the environment

```sh
cp .env.example .env
```

Warpdrive reads `process.env` in exactly one module, which validates every variable
with a schema and throws at import time. A misconfigured deployment fails loudly at
boot rather than misbehaving hours later.

### Deployment values

| Variable | Value on the box |
| --- | --- |
| `APP_DOMAIN` | `crm.example.com`, the public hostname |
| `ACME_EMAIL` | an address for Let's Encrypt expiry notices |
| `BASE_URL` | `https://crm.example.com` |
| `NEXT_PUBLIC_WS_URL` | `wss://crm.example.com/_ws` |
| `WS_PUBLIC_URL` | `ws://ws:8080`, the internal Compose address |
| `MINIO_ENDPOINT` | `https://s3.crm.example.com` |
| `DATABASE_URL` | `postgres://warpdrive:warpdrive@postgres:5432/warpdrive` |
| `SEED_ADMIN_EMAIL` | the first admin's email address, required in production |
| `ALLOW_FIRST_LOGIN_ADMIN` | `false` |

Three of these cause silent, confusing failures when set wrongly, so they are worth
stating plainly:

- **`MINIO_ENDPOINT` must be the public `https://s3.<domain>` URL**, not the internal
  `minio` Compose alias. The browser POSTs presigned uploads directly to this address,
  so an internal hostname is unreachable from where it actually gets used. Every
  upload fails if this is wrong.
- **`NEXT_PUBLIC_WS_URL` must be set at build time.** `NEXT_PUBLIC_*` variables are
  inlined into the client bundle when the image is built, not read at runtime. If it
  is missing, the app still starts and looks healthy, but the board, inbox,
  notifications, and presence indicators silently never update.
- **`ALLOW_FIRST_LOGIN_ADMIN` stays `false` in production.** The environment boundary
  rejects `true` when running in production, because it would promote whoever signs
  in first to administrator.

### Business values

| Variable | Meaning |
| --- | --- |
| `BASE_CURRENCY` | Currency deal values are recorded in. Defaults to `USD`. |
| `MAX_FILE_BYTES` | Upload size ceiling. Defaults to `26214400` (25 MiB). |
| `GOOGLE_WORKSPACE_DOMAIN` | Restricts sign-in to a single Workspace domain. |
| `APP_VERSION` | Version shown as "current" by the update banner. |
| `DISABLE_UPDATE_CHECK` | Set `true` to disable the update banner and its GitHub poll. |

### Generate the secrets

```sh
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY (32-byte base64 key)
openssl rand -hex 32      # WS_TICKET_SECRET (>= 32 chars)
openssl rand -hex 16      # MINIO_ACCESS_KEY / MINIO_SECRET_KEY
```

`DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `WS_TICKET_SECRET`,
`GOOGLE_OAUTH_CLIENT_SECRET`, and `MINIO_SECRET_KEY` may each instead be supplied as
`<VAR>_FILE` pointing at a file path, for use with Docker secrets. The app reads the
file contents at boot.

## 2. Set up Google OAuth

Warpdrive uses Google for sign-in and for the Gmail integration. Create an OAuth
client in the Google Cloud console for the project that owns your Workspace, then set
`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

Register both redirect URIs:

- the application sign-in callback, and
- `https://<your-domain>/api/gmail/oauth/callback` for mailbox connection.

Connecting a mailbox needs the `openid` and `email` scopes in addition to the Gmail
scopes, because the callback binds the returned mailbox to a warpdrive user through
the userinfo endpoint. Omitting them makes mailbox connection fail after the consent
screen, which reads like a Gmail problem but is not.

See [Email sync](./administration/email-sync.md) for connecting mailboxes once the
app is running.

## 3. Bring it up

```sh
docker compose up -d --build
```

Startup order is handled for you. Postgres becomes healthy, a one-shot `migrate`
service applies the schema and `createbuckets` provisions the MinIO bucket, then
`app`, `ws`, and `worker` start. Caddy waits for the app to report healthy, then
fetches a TLS certificate on the first request to `https://<APP_DOMAIN>`.

Check it:

```sh
docker compose ps
curl -fsS https://<APP_DOMAIN>/api/health   # -> {"ok":true}
```

## 4. First admin login

`SEED_ADMIN_EMAIL` is bootstrapped as the initial administrator. Sign in with that
Google account through the normal flow and it is promoted on first login.

From there, invite the rest of your team from
[Users and teams](./administration/users-and-teams.md).

## Local development

The base Compose file is production-only: no host ports, TLS through Caddy. For a
local run, merge the development overrides, which expose host ports and drop Caddy:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The app is then at `http://localhost:3000`, the MinIO console at
`http://localhost:9001`, and Postgres at `localhost:5433`. Set
`BASE_URL=http://localhost:3000` and `NEXT_PUBLIC_WS_URL=ws://localhost:8080` for this
mode.

## Operating the deployment

See [Updating](./operations/updating.md) for upgrades, backups, and day-to-day
operation.
