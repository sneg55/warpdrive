---
sidebar_position: 3
title: Leads
description: "The Warpdrive leads inbox: capturing unqualified prospects, linking them to people and organizations, converting them into deals, and archiving."
---

# Leads

Leads are prospects that are not yet real deals. They live in their own inbox so that
unqualified interest does not clutter the [pipeline](./pipeline.md).

`/leads` is the list; `/leads/[leadId]` is one lead.

![The leads inbox](/img/screenshots/leads/list.png)

Opening a lead from the list shows it in a slide-over panel over the list rather than
navigating away.

## What a lead holds

A lead has a title, an optional value, a source, and links to a person and an
organization. Labels and owners work as they do on deals.

## Linking to contacts

A lead links to a person and an organization. On import, those links are resolved
find-or-create, so a lead for an existing company attaches to that company rather than
creating a duplicate.

## Converting

Converting a lead creates a deal from it, carrying across its value, contacts, and
labels, and takes the lead out of the active list.

Conversion is the point at which something enters the pipeline, which is what keeps
pipeline totals meaningful.

## Archiving

Leads that go nowhere are archived rather than deleted, so the record of having tried
survives. Archived leads are excluded from the active list.

## Visibility

Leads follow the same visibility model as other records. See
[Visibility groups](../administration/visibility-groups.md).

## Related

- [Import](./import.md), for bulk lead import.
- [Contacts](./contacts.md)
- [Pipeline](./pipeline.md)
