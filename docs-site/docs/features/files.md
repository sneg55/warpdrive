---
sidebar_position: 13
title: Files
description: "Attaching files to Warpdrive records: presigned direct uploads to object storage, size limits, and where files are stored."
---

# Files

Files can be attached to deals, people, and organizations, and are listed on the
record with their size and uploader.

## How uploads work

The browser uploads **directly to object storage** using a presigned URL. The
application server issues the URL but never handles the bytes, which keeps large
uploads off the app process.

Two consequences follow from that design:

- **`MINIO_ENDPOINT` must be reachable from the browser.** In a single-box deployment
  that is the public `https://s3.<domain>` hostname, not the internal `minio` alias.
  An internal address produces presigned URLs the browser cannot reach, and every
  upload fails. See [Installation](../setup.md).
- The `s3.` subdomain needs its own DNS record and certificate.

## Size limit

`MAX_FILE_BYTES` caps upload size, defaulting to `26214400` (25 MiB).

## Storage and backups

Files live in the `miniodata` volume. **A database backup alone does not include
them.** Back up both, or a restore returns records whose attachments are missing. See
[Updating](../operations/updating.md).

## Visibility

A file inherits the visibility of the record it is attached to.

## Related

- [Deal workspace](./deal-workspace.md)
- [Installation](../setup.md)
