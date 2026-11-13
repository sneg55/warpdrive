---
sidebar_position: 1
title: Pipeline
description: "The Warpdrive pipeline: the drag-and-drop deal board, list and archive views, filtering and sorting, bulk actions, and configuring stages and rotting."
---

# Pipeline

The pipeline is where deals live. Each pipeline has an ordered set of stages, and
every open deal sits in exactly one of them.

Three views share the same pipeline and the same toolbar, switched from the route
selector: **Board**, **List**, and **Archive**. The pipeline dropdown at the top lists
your pipelines, and administrators and holders of `pipeline.manage` also see **Add new
pipeline** there.

## Board

`/pipeline` sends you to the first pipeline you can see. `/pipeline/[id]` renders that
pipeline's board, one column per stage.

![The pipeline board](/img/screenshots/pipeline/board.png)

Each column header shows the stage name and the total value of the deals in it. Each
card shows the deal title, its value, its organization and person, labels, and an
activity indicator. Won and lost cards (see the status filter below) carry a status
badge and never rot.

### Moving deals

Drag a card to another stage, or to a new position within its current stage. The move
is applied optimistically and reconciled with the server afterwards, so the board does
not wait on a round trip.

A pointer gesture only becomes a drag after **8 pixels of movement**. Below that
threshold it is treated as a click, which opens the deal. This is what lets the same
card be both clickable and draggable without the two competing.

While dragging, three drop targets appear: **Won**, **Lost**, and **Move**.

![Dragging a deal, showing the Lost, Won, and Move drop targets](/img/screenshots/pipeline/board-drag.png)

Won and Lost close the deal immediately. Move opens a stage picker, which is useful
for sending a deal to a stage that is scrolled off screen.

:::note
Closing a deal removes it from the board and the list, because both show only open
deals, unless the filter has a Status condition. A Status condition lifts the open-only
restriction, so you can bring closed deals back onto the board and the list. A closed
deal does not appear in Archive unless you archive it separately.
:::

### Filtering and sorting

The Filter control builds multi-condition filters over the pipeline, including on
labels, combined as match-all or match-any. The available fields include **Status** (Open, Won, or Lost), the **Next activity
date** and **Last activity date**, and the won date. Date conditions accept relative
periods such as Today or Last 30 days, which stay live when saved; see
[Filters and saved views](./saved-filters.md). Filtered board totals reflect the
filter, so the stage and board sums answer "how much is in this slice", not "how
much exists".

![Building a filter](/img/screenshots/pipeline/board-filter.png)

Sorting applies **independently within each stage** rather than across the board as a
whole, which is the only ordering that makes sense when every column is its own queue.
Deals with no value for the sorted field always sort last, in both ascending and
descending order.

The toolbar's sort, owner filter, saved view, and ad-hoc filter all survive a page
reload. The List and Archive views use the same persisted filter, owner, and view as
the board, so a filter you set on one carries over to the others.

Filters can be saved and shared. See
[Filters and saved views](./saved-filters.md).

### Collapsing stages

Stage columns can be collapsed to reclaim horizontal space. Collapse is per-view state
and is not remembered between visits.

## List

`/pipeline/[id]/list` shows the same open deals as a table.

![The pipeline list view](/img/screenshots/pipeline/list.png)

Columns can be shown, hidden, and reordered, and that arrangement is remembered per
user. Custom fields are available as columns, and a Status column is available but
hidden by default. Row titles can be edited in place with the hover Edit control: Enter or clicking
away saves, Escape cancels. Blank titles, unchanged titles, and titles over 255
characters are ignored rather than rejected with an error.

The footer reports the number of deals and their total value **across the entire
filtered result set**, not just the rows currently loaded.

### Bulk actions

Select rows individually or all at once, then move the selection to another stage or
archive it from the bulk toolbar. Archive is not offered on the Archive view.

![Bulk selection with the stage picker open](/img/screenshots/pipeline/list-bulk.png)

Bulk moves require the `bulk.edit` permission, and each row is then separately checked
for visibility, target-pipeline compatibility, and edit authority. A row you cannot
edit is skipped rather than moved.

Bulk archive does not use `bulk.edit`. Each deal goes through the same check as
archiving a single deal, which needs edit authority over that deal, and deals that
fail it are skipped.

## Archive

`/pipeline/[id]/archived` lists archived deals, with an Unarchive control on each row.

![The archive view](/img/screenshots/pipeline/archived.png)

Archive is the one view that drops the open-only restriction, so archived open, won,
and lost deals appear together here.

## Creating deals

`+ Deal` opens the Add deal dialog. A stage's own add control does the same thing with
that stage preselected.

![The Add deal dialog, with the contact autocomplete open](/img/screenshots/pipeline/add-deal.png)

In the dialog you can select an existing person and organization or create new ones
inline, set the title and value, choose the pipeline and stage, apply labels, set an
expected close date and owner, record a source, and pick a visibility group.

A title is required, and so is a stage. New deals are always created open.

Adding a deal from an email thread's sidebar prefills the thread's linked contact.

When creating a new person inline, you can add multiple phone numbers and email
addresses. Those controls are disabled once you select an existing person, since you
would then be editing that person's record rather than the deal.

## Configuring stages

`/pipeline/[id]/edit` edits the pipeline name and its stages.

![Editing pipeline stages](/img/screenshots/pipeline/edit.png)

You can rename the pipeline, rename stages, add stages, remove stages, drag stages
into a new order, and enable stage rotting.

**Rotting** flags a deal that has sat in one stage too long. Enabling it on a stage
starts at 7 days, and the threshold has a minimum of 1 day.

Two rules apply when deleting a stage:

- **Deals move to another stage.** Deleting a stage that still contains deals opens a
  **Move deals to** dialog. You choose a stage in the same pipeline, and all of the
  stage's deals move there in one transaction. That includes won, lost, archived, and
  deleted deals, not only the open ones visible on the board. Nothing changes until
  you save.
- **A pipeline must keep at least one stage.** The delete control is disabled when
  only one stage remains.

:::caution
Saving the stage editor runs as a sequence of separate operations: rename, then
deletes, then creates, then updates, followed by a separate call that saves the stage
order. If a later operation fails, the earlier ones are **not** rolled back. A retry
picks up the operations that already applied instead of repeating them, but if a save
keeps reporting an error, re-open the editor to see what applied.
:::

Creating pipelines and editing stages requires administrator status or the
`pipeline.manage` permission. The Edit pipeline link is shown to everyone, but the
save is rejected if you lack the permission.

## Preferences

Two settings on `/settings/profile` change how the board behaves:

- **Card density**, Comfortable or Compact. Compact cards drop the organization and
  person line.
- **Open details view after creating a new item**, which has a separate switch for
  Lead/deal, Person, and Organization. With the Lead/deal switch on, creating a deal
  navigates straight to it instead of staying on the board.

## Realtime

The board updates in place as other people move, create, and close deals, over the
shared WebSocket connection described in [Architecture](../architecture.md). If the
board never updates for anyone, `NEXT_PUBLIC_WS_URL` is the first thing to check.

## Related

- [Deal workspace](./deal-workspace.md), the per-deal page.
- [Filters and saved views](./saved-filters.md), for reusing and sharing filters.
- [Visibility groups](../administration/visibility-groups.md), which control who sees
  which deals.
