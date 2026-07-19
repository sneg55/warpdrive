---
sidebar_position: 8
title: Dashboard and stats
description: "The Warpdrive dashboard: pipeline value, deals won and lost, activity, and why two people can legitimately see different numbers."
---

# Dashboard and stats

`/dashboard` summarizes the state of the pipeline.

![The dashboard](/img/screenshots/dashboard/overview.png)

It covers pipeline value by stage, deals won and lost over a period, and activity
volume.

## Numbers are visibility-scoped

Dashboard figures are computed with the same visibility rule as the records behind
them. Records you cannot see do not contribute.

:::note
Two people can legitimately see different totals for the same pipeline over the same
period. That is the visibility model working as designed, not a reporting fault.

When reconciling a disputed number, compare as the **same user**, then check
[visibility groups](../administration/visibility-groups.md).
:::

## Scope

The dashboard is deliberately a summary rather than a reporting tool. Forecast views
and configurable reports are out of scope for Warpdrive. For anything beyond these
figures, query the database directly.

## Related

- [Pipeline](./pipeline.md)
- [Activities](./activities.md)
