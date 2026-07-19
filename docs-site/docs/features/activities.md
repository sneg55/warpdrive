---
sidebar_position: 5
title: Activities
description: "Calls, meetings, and tasks in Warpdrive: scheduling against deals and contacts, the list and calendar views, completion, and overdue handling."
---

# Activities

Activities are the scheduled work attached to records: calls, meetings, and tasks.

## Views

`/activities/list` is the table view and `/activities/calendar` is the calendar.

![The activities list](/img/screenshots/activities/list.png)

The list is the better view for triage, since it sorts and filters. The calendar is
the better view for scheduling, since it shows conflicts.

![The activities calendar](/img/screenshots/activities/calendar.png)

## Scheduling

An activity can be created from the activities views, or directly on a deal, person,
or organization, which links it to that record.

An activity has a type, a subject, an optional due date and time, a duration, a
priority, and an assignee. Activity types are configurable, see
[Company settings](../administration/company-settings.md).

Activities without a due date are valid. They appear as undated rather than being
treated as overdue.

## Completion and overdue

Activities are marked done from the list, the calendar, or the record they belong to.
An incomplete activity past its due date is styled as overdue.

A deal's next activity is surfaced on its board card, which is what makes the board
usable as a work queue rather than only a status display.

## Visibility

:::caution
Activity visibility is evaluated by **different rules** than the records they are
attached to. Restricting a deal does not automatically restrict activities that
reference it.

If you rely on restricted access, verify it by signing in as a restricted account and
checking the activities views directly.
:::

See [Visibility groups](../administration/visibility-groups.md).

## Related

- [Deal workspace](./deal-workspace.md)
- [Dashboard](./dashboard.md)
