---
sidebar_position: 12
title: Collaboration
description: "Working together in Warpdrive: notes and comments, @mentions, followers, and live presence indicators."
---

# Collaboration

## Notes and comments

Notes are free-text entries on a deal, person, or organization, newest first. A note
can be pinned to hold it at the top, which is the usual way to keep account context
visible.

Notes can carry comments, so a discussion stays attached to the note rather than
becoming a series of separate notes.

## Mentions

Typing `@` in a note or comment offers colleagues to mention. Mentioning someone
notifies them and links them back to the record.

A mention does not grant access. If the mentioned person cannot see the record, the
mention does not make it visible to them, so mentioning is not a sharing mechanism.
Use [visibility groups](../administration/visibility-groups.md) for that.

## Followers

Following a record subscribes you to its [notifications](./notifications.md) without
owning it or changing who can see it.

## Presence

When several people have the same record open, presence indicators show who else is
there, so two people do not unknowingly edit the same deal at once.

Presence is realtime and depends on the WebSocket connection. If indicators never
appear for anyone, check `NEXT_PUBLIC_WS_URL` as described in
[Architecture](../architecture.md).

## Related

- [Notifications](./notifications.md)
- [Deal workspace](./deal-workspace.md)
