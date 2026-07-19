---
sidebar_position: 9
title: Notifications
description: "The Warpdrive notification panel: what generates a notification, unread counts, following records, and per-user notification preferences."
---

# Notifications

The bell in the application header opens the notification panel, with an unread
indicator.

![The notification panel](/img/screenshots/notifications/panel.png)

## What generates one

- Being **@mentioned** in a note or comment.
- Activity on a record you **follow**.
- Assignment of a record or activity to you.

## Following

Following a deal or contact subscribes you to its notifications without owning it,
which is how someone stays informed about a deal they are not running.

## Reading

Opening a notification takes you to the record it refers to and marks it read. The
unread count updates live over the shared WebSocket connection, so a colleague's
action updates your badge without a refresh.

## Preferences

`/settings/notifications` controls which categories you receive.

## Visibility

Notifications never reveal records you cannot see. A notification for a record whose
visibility changed does not become a way around
[visibility groups](../administration/visibility-groups.md).

## Related

- [Collaboration](./collaboration.md)
- [Activities](./activities.md)
