---
sidebar_position: 2
title: Installation
description: "Deploy Warpdrive on a single box with Docker Compose: prerequisites, environment variables, TLS, Garage object storage, sign-in through Google or any OIDC provider, and the first admin login."
---

# Installation

Warpdrive ships as a self-contained Docker Compose stack: the Next.js app, a
WebSocket server, a background worker, Postgres, Garage object storage, and a Caddy
reverse proxy that terminates TLS with automatic Let's Encrypt certificates. One
`docker compose up -d --build` brings up the whole thing.

## Prerequisites

- A Linux box with Docker and the Compose plugin.
- A domain name with an `A`/`AAAA` record pointing at the box's public IP. This is
  required, not cosmetic: Google OAuth will not redirect to a bare IP address.
- **A second `A`/`AAAA` record for an `s3.` subdomain** (for example
  `s3.crm.example.com`), also pointing at the box. The browser uploads files (CSV
  imports, avatars, attachments) directly to Garage through this hostname, so it needs
  its own DNS record and certificate. Skipping this breaks every upload.
- Ports 80 and 443 open. Caddy needs port 80 for the ACME challenge.
- A sign-in provider: a Google OAuth client (Workspace) or any OpenID Connect provider such as
  Authelia, Authentik or Keycloak. Google is only needed for sign-in if you use it, but it is
  needed if you want the Gmail integration. Covered below.

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
| `S3_ENDPOINT` | `https://s3.crm.example.com` |
| `S3_SERVER_ENDPOINT` | optional; the address the app and worker containers dial for their own storage calls (empty falls back to `S3_ENDPOINT`) |
| `GARAGE_RPC_SECRET` | 32 bytes of hex, required by the Compose file (see below) |
| `DATABASE_URL` | `postgres://warpdrive:warpdrive@postgres:5432/warpdrive` |
| `SEED_ADMIN_EMAIL` | the first admin's email address, required in production |
| `ALLOW_FIRST_LOGIN_ADMIN` | `false` |

Three of these cause silent, confusing failures when set wrongly, so they are worth
stating plainly:

- **`S3_ENDPOINT` must be the public `https://s3.<domain>` URL**, not the internal
  `garage` Compose alias. The browser POSTs presigned uploads directly to this address,
  so an internal hostname is unreachable from where it actually gets used. Every
  upload fails if this is wrong. The app and worker containers use
  `S3_SERVER_ENDPOINT` for their own storage calls (verifying an upload, copying and
  deleting objects), which defaults to `S3_ENDPOINT`. Set it to the compose-internal
  `http://garage:3900` whenever the containers cannot reach the public URL; otherwise
  uploads land in the bucket but the follow-up verification fails. It is read by the
  server side only and never appears in a URL the browser uses.
- **`NEXT_PUBLIC_WS_URL` is the address browsers use for realtime.** The server reads
  it at runtime and hands it to each signed-in page, so one image works for any
  domain and changing it needs only a restart. If it is missing, the app still starts
  and looks healthy, but the board, inbox, notifications, and presence indicators
  silently never update.
- **`ALLOW_FIRST_LOGIN_ADMIN` stays `false` in production.** The environment boundary
  rejects `true` when running in production, because it would promote whoever signs
  in first to administrator.

### Business values

| Variable | Meaning |
| --- | --- |
| `BASE_CURRENCY` | The single currency every amount is shown in, as a three-letter ISO 4217 code such as `EUR` (case does not matter). Defaults to `USD`. Applied each time migrations run, so changing it later takes effect on the next restart. Stored amounts are relabelled, not converted. A value that is not three letters stops the app at startup. |
| `MAX_FILE_BYTES` | Upload size ceiling. Defaults to `26214400` (25 MiB). |
| `GOOGLE_WORKSPACE_DOMAIN` | The Workspace domain. Required whenever the Google client values are set. Restricts Google sign-in to that domain and is the domain personal mailbox connections must match. |
| `GOOGLE_SIGNIN_ENABLED` | Defaults to true when `GOOGLE_OAUTH_CLIENT_ID` is set. Set it to `false` to keep Gmail connect while signing users in through another IdP. |
| `OIDC_ISSUER_URL` | Turns on generic OIDC sign-in for this issuer. Use https; Authelia refuses to start with a non-https issuer URL, and a self-signed certificate needs `NODE_EXTRA_CA_CERTS`. Leave empty to disable. See [Single sign-on](./administration/single-sign-on.md). |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Credentials of the client registered at that issuer. Required once `OIDC_ISSUER_URL` is set. |
| `OIDC_ALLOWED_GROUPS` | Comma-separated group names allowed to sign in. Required once `OIDC_ISSUER_URL` is set, and fail-closed: an empty value rejects every OIDC sign-in. |
| `AVATAR_GRAVATAR_ENABLED` | Defaults to `false`. Uses gravatar.com for users whose IdP sends no picture, and as the fallback for existing users without an avatar. Set `false` to stop browsers from requesting images from that domain. |
| `APP_VERSION` | Version shown as "current" by the update banner. |
| `MCP_ENABLED` | Defaults to `true`. Turns on the MCP server and its OAuth endpoints, and requires `OAUTH_SIGNING_KEY`. Set `false` to opt out. |
| `OAUTH_SIGNING_KEY` | Base64 of exactly 32 bytes. Signs MCP access tokens. Required while `MCP_ENABLED` is `true`. |
| `DISABLE_UPDATE_CHECK` | Set `true` to disable the update banner and its GitHub poll. |

### Generate the secrets

```sh
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY (32-byte base64 key)
openssl rand -hex 32      # WS_TICKET_SECRET (>= 32 chars)
openssl rand -hex 16      # S3_ACCESS_KEY / S3_SECRET_KEY
openssl rand -hex 32      # GARAGE_RPC_SECRET (exactly 32 bytes, hex)
openssl rand -base64 32   # OAUTH_SIGNING_KEY (32-byte base64 key)
```

The app refuses to start with `MCP_ENABLED` on (the default) and no valid
`OAUTH_SIGNING_KEY`, so a fresh install needs this key. If you do not want the MCP
server, set `MCP_ENABLED=false` instead and skip it. See [MCP server](./features/mcp.md).

`DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `WS_TICKET_SECRET`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `S3_SECRET_KEY`, `OAUTH_SIGNING_KEY`, and
`INTERCOM_ACCESS_TOKEN` may each instead be supplied as `<VAR>_FILE` pointing at a file
path, for use with Docker secrets. The app reads the file contents at boot.

Garage creates the `S3_BUCKET` bucket and an access key from `S3_ACCESS_KEY` and
`S3_SECRET_KEY` on first start. Garage requires an access key of at least 8
characters and a secret of at least 16. The Compose file signs storage requests for
region `garage`, which is what the bundled Garage serves. When `S3_ENDPOINT` points
at a different S3-compatible store, set `S3_REGION` to that store's region, or leave
it empty outside Compose and the client discovers the bucket's region. Installs that
still set the older `MINIO_*` names keep working: each `S3_*` variable falls back to
its `MINIO_*` counterpart when unset.

### Optional integrations

| Variable | Meaning |
| --- | --- |
| `OAUTH_REGISTRATION` | `open` (default) or `disabled`. Open lets an MCP client register itself. Set `disabled` once your clients are connected: existing grants keep working. See [MCP server](./features/mcp.md). |
| `INTERCOM_ACCESS_TOKEN` | Intercom access token. Empty by default, which leaves Intercom off. See [Intercom](./features/intercom.md). |
| `INTERCOM_REGION` | Intercom data region: `us`, `eu`, or `au`. Defaults to `us`. |
| `X_CLIENT_ID` | OAuth 2.0 client ID of your X developer app. Empty by default. X direct messages turn on only when both this and `X_CLIENT_SECRET` are set. See [X direct messages](./features/x-dms.md). |
| `X_CLIENT_SECRET` | OAuth 2.0 client secret of the same X app. |
| `POSTHOG_KEY` | PostHog project ingestion token. Leaving it or `POSTHOG_HOST` empty disables all telemetry. |
| `POSTHOG_HOST` | PostHog host URL. |
| `DISABLE_TELEMETRY` | Set `true` to turn telemetry off even when the PostHog values are set. Defaults to `false`. |
| `TELEMETRY_CONSOLE_FORWARDING` | Set `true` to also forward browser `console.warn` and `console.error` messages. Off by default. |
| `APP_COMMIT` | Git SHA of the running build, attached to telemetry events. Empty by default. |

## 2. Set up sign-in

Pick one provider, or both. Users can sign in through either when both are enabled; the
login page shows one button per enabled provider.

### Google

Create an OAuth client in the Google Cloud console for the project that owns your
Workspace, then set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and
`GOOGLE_WORKSPACE_DOMAIN`.

Register both redirect URIs:

- the application sign-in callback `https://<your-domain>/auth/callback` (the path the
  app sends to Google, so it must be registered exactly; internally it forwards to
  `/auth/callback/google`), and
- `https://<your-domain>/api/gmail/oauth/callback` for mailbox connection.

Connecting a mailbox needs the `openid` and `email` scopes in addition to the Gmail
scopes, because the callback binds the returned mailbox to a warpdrive user through
the userinfo endpoint. Omitting them makes mailbox connection fail after the consent
screen, which reads like a Gmail problem but is not.

See [Email sync](./administration/email-sync.md) for connecting mailboxes once the
app is running.

### Any other OIDC provider

Register a confidential client at your IdP with the redirect URI
`https://<your-domain>/auth/callback/oidc` and the scopes `openid`, `email`, `profile`
and `groups`, then set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
`OIDC_ALLOWED_GROUPS`.

Sign-in is allowed only for users whose `groups` claim contains one of the allowed
groups, and the provider must return the user's workspace address as a verified
`email` claim. [Single sign-on](./administration/single-sign-on.md) covers the
identity matching rules, the full claim requirements, and how to move users between
providers.

## 3. Bring it up

```sh
docker compose up -d --build
```

Startup order is handled for you. Postgres becomes healthy, a one-shot `migrate`
service applies the schema and `storagecors` sets the bucket's CORS rule for
`BASE_URL`, then
`app`, `ws`, and `worker` start. Caddy waits for the app to report healthy, then
fetches a TLS certificate on the first request to `https://<APP_DOMAIN>`.

Check it:

```sh
docker compose ps
curl -fsS https://<APP_DOMAIN>/api/health   # -> {"ok":true}
```

## 4. First admin login

`SEED_ADMIN_EMAIL` is bootstrapped as the initial administrator. Sign in with that
account through your configured provider and it is promoted on first login.

From there, invite the rest of your team from
[Users and teams](./administration/users-and-teams.md).

## Local development

The base Compose file is production-only: no host ports, TLS through Caddy, and a runtime image
without devDependencies. For a local run, merge the development overrides, which expose host
ports, drop Caddy, and run the services from your working tree:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The override bind-mounts the repository into the `app`, `ws`, `worker`, and `migrate`
containers and runs `next dev` / `tsx watch` instead of the production entrypoints. Editing a
React component or server module therefore reloads in place; no image rebuild is needed for
source edits. A one-shot `dev-deps` service installs the full dependency tree into a shared
`dev_node_modules` volume before the others start, so development dependencies are present and
the host's `node_modules` is never used. Re-run with `--build` after changing `package.json`,
`pnpm-lock.yaml`, or the `Dockerfile`.

The app is then at `http://localhost:3000`, the Garage S3 API at
`http://localhost:9000` (use it as `S3_ENDPOINT`), and Postgres at `localhost:5433`. Set
`BASE_URL=http://localhost:3000`, `NEXT_PUBLIC_WS_URL=ws://localhost:8080` and
`S3_SERVER_ENDPOINT=http://garage:3900` for this mode. Inside the Compose network the containers cannot reach the host-published `localhost:9000`, so the
server side dials Garage by its Compose service name.

The development overrides also run a pre-configured Authelia provider, so you can exercise SSO
without a Google tenant: choose **Sign in with SSO** on the login page and sign in as
`admin@example.com` with the password `warpdrive-dev`. See
[Single sign-on](./administration/single-sign-on.md#local-development) for the available users
and the one-time certificate warning.

To sign in without any provider, open the `dev-login` route:
`http://localhost:3000/auth/dev-login?email=admin@example.com`, where `admin@example.com`
is the address you set in `SEED_ADMIN_EMAIL`. The development override sets
`NODE_ENV=development`; the route also requires `ALLOW_FIRST_LOGIN_ADMIN=true`. Never set either
on a real deployment.

To access the database, use Adminer:

http://localhost:8097/?pgsql=postgres&username=warpdrive&db=warpdrive&ns=public (password: `warpdrive`).

## Operating the deployment

See [Updating](./operations/updating.md) for upgrades, backups, and day-to-day
operation.
