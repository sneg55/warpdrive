---
sidebar_position: 5
title: Data fields
description: "Add custom fields to Warpdrive deals, leads, people, organizations, and activities, and hide built-in fields you do not use."
---

# Data fields

`/settings/fields` manages the fields available on deals, leads, people, organizations, and activities.

![Data fields settings](/img/screenshots/data-fields/list.png)

## Custom fields

Custom fields are stored as JSONB rather than as new database columns, which is what
allows adding one without a schema migration or a restart.

A custom field appears on the record's detail page alongside the built-in fields, and
is available in filters and in [CSV import](../features/import.md) column mapping.

Custom fields can also be shown as columns in the leads, people, organizations, and
deals lists. They are off by default: turn them on from the list's column controls.

## Hiding built-in fields

Built-in fields can be hidden when your team does not use them, which shortens the
detail pages and the import mapping step.

:::note
Some built-in fields are structural rather than optional. A deal's stage is the
chevron bar in the header, and its value and pipeline sit in the header itself. These
are required to create a record, so hiding them affects **import only**, not the
creation form.
:::

## Related

- [Company settings](./company-settings.md), for labels, lost reasons, and activity
  types.
- [Import](../features/import.md)
