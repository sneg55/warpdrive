---
sidebar_position: 3
title: Visibility groups
description: "How Warpdrive decides which records a user can see: visibility groups, ownership, explicit grants, team management, and restricted pipelines."
---

# Visibility groups

Visibility decides **which records exist as far as a given user is concerned**. It is
evaluated before any [permission](./permission-sets.md), and permissions never widen
it.

`/settings/visibility-groups` manages groups. An **Everyone** group is seeded on first
run, and every new or invited user joins it as their primary group.

![Visibility groups](/img/screenshots/visibility-groups/list.png)

## How visibility is decided

For a given record and user, visibility can come from any of:

- an explicit grant to that user,
- ownership of the record,
- ownership by a member of a team the user **manages**,
- the record being marked visible to all, or
- the record's visibility group matching one of the user's groups.

Any one of these is sufficient.

## Restricted pipelines come first

A restricted pipeline is a **hard gate** for non-administrators, evaluated before
everything above.

If a user cannot see the pipeline, they cannot see its deals, and that holds even if
they own a deal in it or were granted it explicitly. Restricting a pipeline is
therefore the strongest control available, and also the easiest way to accidentally
hide someone's own deals from them.

## Visibility and aggregates

Counts and totals are computed with the same visibility rule as the rows, so invisible
records do not contribute to stage totals, list footers, or dashboard figures.

Two people can legitimately see different totals for the same pipeline. That is the
model working, not a reporting bug.

## Entities and activities

Visibility for records and for activities is evaluated by separate rules. Restricting
a record does not automatically restrict every activity referencing it.

:::caution
When configuring restricted access, verify the result by signing in as an account that
holds the restricted configuration and checking each surface. This distinction between
entity and activity scoping has been a repeated source of mistakes, and it is not
visible from the configuration screen.
:::

## Related

- [Permission sets](./permission-sets.md)
- [Users and teams](./users-and-teams.md)
