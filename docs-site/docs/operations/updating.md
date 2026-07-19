---
sidebar_position: 1
title: Updating
description: "Upgrade a self-hosted Warpdrive deployment, take database and file backups, read logs, and reach Postgres and MinIO on the box."
---

# Updating

## Upgrading

```sh
git pull
docker compose up -d --build
```

Migrations are applied automatically by the one-shot `migrate` service before the app
restarts, so there is no separate migration step.

## The update banner

Administrators see an in-app banner when a newer release is published on GitHub.

| Variable | Effect |
| --- | --- |
| `APP_VERSION` | The version reported as current. Usually stamped at build from the release tag. Falls back to `package.json`, then to `dev`, which disables the banner. |
| `DISABLE_UPDATE_CHECK` | Set `true` to disable the banner and the GitHub poll entirely. |

Set `DISABLE_UPDATE_CHECK=true` for deployments that should make no outbound calls.

## Backups

Two volumes hold state, and **both** are needed for a usable restore. A database dump
alone restores records whose attachments are gone.

Database:

```sh
docker compose exec -T postgres pg_dump -U warpdrive warpdrive \
  | gzip > backup-$(date +%F).sql.gz
```

Files live in the `miniodata` volume; back that up alongside the database.

Test a restore before you need one.

## Logs

```sh
docker compose logs -f app      # the application
docker compose logs -f worker   # mailbox sync, imports, scheduled sends
docker compose logs -f ws       # realtime
docker compose logs -f caddy    # TLS and routing
```

**`worker` is the one people forget.** Background work (mailbox sync, CSV imports,
scheduled sends) runs only there. An import stuck at "uploaded" or mail that never
arrives is usually a worker that is not running, not an application fault.

## Reaching Postgres

Postgres is deliberately not published to the host in production:

```sh
docker compose exec postgres psql -U warpdrive
```

MinIO's S3 API is reachable through Caddy at `https://s3.<APP_DOMAIN>`, because the
browser needs it for presigned uploads. Its admin console stays internal, so forward a
port temporarily to reach it.

## Health

```sh
curl -fsS https://<APP_DOMAIN>/api/health   # -> {"ok":true}
```

## Related

- [Installation](../setup.md)
- [Architecture](../architecture.md)
