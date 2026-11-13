---
sidebar_position: 6
title: Team mailboxes
description: "Shared Gmail mailboxes in Warpdrive: connecting one as an admin, choosing members, importing history, shared read state, sending, and the reply-status chips."
---

# Team mailboxes

A team mailbox is a shared Gmail mailbox, such as `support@` or `sales@`, that a
chosen group of users read and answer together. Members see the same threads, share one
read state, and can tell at a glance which conversations still need an answer.

Personal mailboxes are unchanged. See [Email](./email.md) for those.

## Requirements

The mailbox must be a Google Workspace account on the domain the deployment is
configured for. Consumer Gmail accounts are not supported, and neither are accounts on
other domains. An address that is already connected as someone's personal mailbox
cannot be connected as a team mailbox.

## Setting one up

Team mailboxes are managed at `/settings/team-mailboxes`, which only admins see in the
settings navigation.

1. Choose how much history to import (see below).
2. Select **Connect team mailbox**. Google shows an account chooser with consent, so you
   can pick the shared account instead of your own.
3. Back in Warpdrive, set the **display name**, the **overdue threshold** in hours
   (default 24), and the **members**, then select **Save mailbox**.

Only members can see or send from the mailbox. Changing the member list takes effect on
save.

### History import

When connecting, an admin chooses to import **30, 90, or 180 days** of existing mail.
The default is 90. The import runs in the background worker and can resume if it is
interrupted. The settings card shows its status.

Imported conversations start as read, and a conversation nobody has answered keeps its
original reply status. Reconnecting a mailbox keeps the history choice made the first
time.

## What members see

Members see a **Team** section in the Inbox folder rail, with one entry per team
mailbox and an unread count. Selecting one lists the mailbox's threads.

- Members see **every** thread in the mailbox, whether or not it is linked to a record.
- Read state is shared. When one member reads a thread, it is read for all of them.
- The unread badge in the main navigation counts personal and team mail together.

## Linking to records

Team mail links to people and deals by the same rules as personal mail (see
[How threads link to records](./email.md#how-threads-link-to-records)), with one
difference: a record counts as visible to the mailbox if **any member** can see it.

Once a thread is linked, people who are not members see it on the person or deal only
if the normal CRM visibility rules let them see that record.

## Sending

The composer's **From** picker lists your personal mailbox and every team mailbox you
belong to. Each message sent from a team mailbox is attributed to the member who sent
it.

- Drafts and the Outbox are private to their author, even on a team mailbox.
- A queued or scheduled send is checked against membership when it goes out. If the
  author has been removed from the mailbox by then, it is not sent.
- Removing a member discards their unsent drafts and queued sends for that mailbox.
- Only an admin can disconnect a team mailbox. Disconnecting stops sync and sending and
  keeps the stored conversations.

## Reply-status chips

Each team thread carries a chip showing whether it has been answered:

- **Unanswered 3h** or **Unanswered 2d** counts the time since the oldest inbound
  message that has no reply after it. The chip is amber, and turns red once the wait
  passes the mailbox's overdue threshold.
- **Replied · Alex** appears once a member answers, with the first name of the member
  who sent the latest reply.
- A new inbound message on a replied thread resets it to **Unanswered**.

## Not included

Team mailboxes do not have:

- Assigning a thread to a member.
- Write-back of read state to Gmail's UNREAD label.
- Response-time reports.
- Notifications for overdue threads.
- Converting an existing personal mailbox into a team mailbox.
- History import for personal mailboxes.

## Related

- [Email](./email.md), for composing, linking, and tracking.
- [Email sync](../administration/email-sync.md), for connection requirements and
  troubleshooting.
