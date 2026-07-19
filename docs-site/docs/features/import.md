---
sidebar_position: 7
title: Import
description: "Import deals, leads, people, and organizations into Warpdrive from CSV: the upload and mapping wizard, deduplication, error reporting, and undo."
---

# Import

`/settings/import` holds import history; `/settings/import/new` starts one.

![The import wizard](/img/screenshots/import/wizard.png)

## The wizard

Import is a stepper:

1. **Upload** a CSV, by drag and drop or file picker.
2. **Map** its columns onto Warpdrive fields, including any
   [custom fields](../administration/data-fields.md).
3. **Preview** the parsed result.
4. **Commit** the import.

## How uploads and processing work

The file uploads directly from the browser to object storage using a presigned URL,
then the import itself runs as a **background job**.

:::caution
Background jobs run only in the `worker` process. If an import stays at "uploaded" and
never progresses, the worker is not running. Check with `docker compose ps` and
`docker compose logs -f worker`.

This is the single most common import problem, and it does not look like a worker
problem from the interface.
:::

Because it is a background job, a large import continues if you navigate away.

## Deduplication and linking

Rows are matched against existing records rather than blindly inserted. Person and
organization links are resolved find-or-create, so importing leads for a company that
already exists attaches them to that company instead of creating a second one.

## Errors

Rows that fail are reported per row with the reason, rather than failing the whole
file. A partially successful import tells you exactly which rows did not land, so the
usual fix is to correct those rows and re-import only them.

## Undo

A completed import can be undone, which removes the records it created. This is what
makes it safe to try an import on real data rather than rehearsing on a copy.

## Hidden fields

Built-in fields hidden in [Data fields](../administration/data-fields.md) are excluded
from column mapping, which keeps the mapping step to fields your team actually uses.

## Related

- [Contacts](./contacts.md)
- [Leads](./leads.md)
- [Data fields](../administration/data-fields.md)
