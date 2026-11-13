---
sidebar_position: 1
title: Updating
description: "Upgrade a self-hosted Warpdrive deployment, take database and file backups, read logs, migrate files from MinIO to Garage, and reach Postgres and Garage on the box."
---

# Updating

## Upgrading

```sh
git pull
docker compose up -d --build
```

Migrations are applied automatically by the one-shot `migrate` service before the app
restarts, so there is no separate migration step.

## Upgrading from MinIO

Releases before the switch to Garage stored files in MinIO, in the `miniodata`
volume. Upgrading starts an empty Garage, so existing files have to be copied across
once. Until the copy finishes, new uploads work but older files fail to download.

1. Add `GARAGE_RPC_SECRET` to `.env` (`openssl rand -hex 32`). Compose refuses to
   start without it. By default the existing `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
   and `MINIO_BUCKET` values become Garage's key and bucket.

   **Check the key lengths first.** Garage refuses to start with an access key
   shorter than 8 characters or a secret shorter than 16, which MinIO allowed (the
   common `minioadmin`/`minioadmin` pair fails). If yours are shorter, add new
   `S3_ACCESS_KEY` and `S3_SECRET_KEY` values (`openssl rand -hex 16` each) and keep
   the `MINIO_*` lines: Garage and the app use the `S3_*` keys, and the copy below
   still needs the old ones to read MinIO.
2. Upgrade and remove the old MinIO containers:

   ```sh
   git pull
   docker compose up -d --build --remove-orphans
   ```

   `--remove-orphans` stops the old `minio` container. The `miniodata` volume is
   kept.
3. Start a temporary MinIO on the old volume. Use the MinIO image that is already on
   the box, because public registries no longer serve it. `docker compose ls` shows the
   project name, which prefixes both the network and the volume:

   ```sh
   docker run -d --name minio-export --network <project>_default \
     -v <project>_miniodata:/data \
     -e MINIO_ROOT_USER=<MINIO_ACCESS_KEY> -e MINIO_ROOT_PASSWORD=<MINIO_SECRET_KEY> \
     quay.io/minio/minio server /data
   ```

4. Copy every object into Garage. Content types are preserved:

   ```sh
   docker run --rm --network <project>_default \
     -e RCLONE_CONFIG_SRC_TYPE=s3 -e RCLONE_CONFIG_SRC_PROVIDER=Minio \
     -e RCLONE_CONFIG_SRC_ENDPOINT=http://minio-export:9000 \
     -e RCLONE_CONFIG_SRC_ACCESS_KEY_ID=<MINIO_ACCESS_KEY> \
     -e RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY=<MINIO_SECRET_KEY> \
     -e RCLONE_CONFIG_DST_TYPE=s3 -e RCLONE_CONFIG_DST_PROVIDER=Other \
     -e RCLONE_CONFIG_DST_ENDPOINT=http://garage:3900 -e RCLONE_CONFIG_DST_REGION=garage \
     -e RCLONE_CONFIG_DST_ACCESS_KEY_ID=<GARAGE_ACCESS_KEY> \
     -e RCLONE_CONFIG_DST_SECRET_ACCESS_KEY=<GARAGE_SECRET_KEY> \
     rclone/rclone:1.71.1 copy src:warpdrive dst:warpdrive --metadata --checksum -v
   ```

   `<GARAGE_ACCESS_KEY>` and `<GARAGE_SECRET_KEY>` are the `S3_*` values if you set
   them in step 1, otherwise the `MINIO_*` values. Replace `warpdrive` with your
   bucket name if you changed it.
5. Download an older attachment in the app to confirm the copy, then stop and delete
   the `minio-export` container. Delete the `miniodata` volume once you no longer need
   it as a fallback.

## The update banner

Releases are tagged on the public GitHub repository, `sneg55/warpdrive`. The worker
checks the latest GitHub release every 6 hours, and the banner appears for
administrators when that release is newer than the version the app is running.

| Variable | Effect |
| --- | --- |
| `APP_VERSION` | The version reported as current. Usually stamped at build from the release tag. Falls back to `package.json`, then to `dev`, which disables the banner. |
| `DISABLE_UPDATE_CHECK` | Set `true` to disable the banner and the GitHub poll entirely. |

Set `DISABLE_UPDATE_CHECK=true` for deployments that should make no outbound calls.

## Backups

Postgres and Garage hold state, and **both** are needed for a usable restore. A database dump
alone restores records whose attachments are gone.

Database:

```sh
docker compose exec -T postgres pg_dump -U warpdrive warpdrive \
  | gzip > backup-$(date +%F).sql.gz
```

Files live in the `garagedata` and `garagemeta` volumes; back both up alongside the
database. Stop the `garage` service while copying them so the metadata snapshot is
consistent.

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

Garage's S3 API is reachable through Caddy at `https://s3.<APP_DOMAIN>`, because the
browser needs it for presigned uploads. It has no web console; administer it with the
CLI inside the container, for example `docker compose exec garage /garage status`.

## Health

```sh
curl -fsS https://<APP_DOMAIN>/api/health   # -> {"ok":true}
```

## Related

- [Installation](../setup.md)
- [Architecture](../architecture.md)
