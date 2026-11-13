---
sidebar_position: 8
title: Performance
description: "The Warpdrive Performance page: sales metrics, the stage funnel, quota goals with pace, and why two people can legitimately see different numbers."
---

# Performance

`/dashboard` is the Performance page: a scoreboard of sales metrics on top, quota
goals under it, and charts below.

![The Performance page](/img/screenshots/dashboard/overview.png)

## Metrics

The scoreboard is five tiles: Deals won, Win rate, Average won deal, Median sales
cycle, and Activities completed. The counts of deals added, lost, and open live in the
Deal performance widget below it, alongside the activity counters, activities
completed by type, per-stage value sums, a won-deals-by-month trend, and lost reasons
by count and value.

Each counter windows on the column that records its event: "Won" over a range means
deals **won** in that range, not deals created in it that happen to be won now, and
a completed activity counts by when it was completed, so finishing overdue backlog
moves the number. Open deals are a snapshot, not windowed. Activities with no due
date get their own count instead of vanishing, and a metric with no data renders a
dash rather than a zero.

## Owner, pipeline, and dates

The owner picker next to the title offers **Me**, **Everyone**, any team, and any
user. Anything wider than **Me** needs the `stats.viewOthers` permission; without it
the picker stays on Me. A pipeline picker defaults to All pipelines.

The two date pickers each carry a list of range presets: This week, Last week, This
month, Last month, Next month, This quarter, and This year. Weeks run Monday to
Sunday.

### Drill-downs

On the scoreboard, **Deals won** opens the list of the won deals behind
the number, and **Activities completed** opens the list of the completed activities.
The links follow the picked owner, pipeline, and date range. Neither links when a team
is picked, and Deals won does not link on All pipelines. Days are counted in your
browser's timezone.

## The funnel

The stage funnel is built from the deals' actual stage history, so it reports how
far a cohort of deals got, with median days in stage, rather than where open deals
happen to be sitting. A deal that moved forward and then back still counts as having
reached the far stage.

"All pipelines" aggregates every pipeline you can see by stage position.

## Quota goals

A goal names what is measured (for example deals won, by value or by count), who it
applies to (the whole company, a team, or one person), and an interval, and carries a
target. The Performance page shows each
goal's progress for the current period as attainment plus **pace**: half the target
booked a fifth of the way through the month reads as ahead, not as 50%.

Periods anchor on the goal's start date rather than the calendar, so a quarterly
goal starting in February runs February to April.

Goals follow the owner picked on the page, and each goal is labelled with its owner.

Goals are managed on `/settings/goals`, behind the `goals.manage` permission.
Reading them needs no permission.

## Numbers are visibility-scoped

Figures are computed with the same visibility rule as the records behind them.
Records you cannot see do not contribute. A goal decides whose work counts toward
the target, but your own visibility still decides which deals you may see behind
the number.

:::note
Two people can legitimately see different totals for the same pipeline over the same
period. That is the visibility model working as designed, not a reporting fault.

When reconciling a disputed number, compare as the **same user**, then check
[visibility groups](../administration/visibility-groups.md).
:::

## Scope

The page is deliberately a summary rather than a reporting tool. Forecast views and
configurable reports are out of scope for Warpdrive. For anything beyond these
figures, query the database directly.

## Related

- [Pipeline](./pipeline.md)
- [Activities](./activities.md)
