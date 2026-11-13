---
sidebar_position: 6
title: Email
description: "Two-way Gmail in Warpdrive: connecting a mailbox, how sync works, how threads link to deals and contacts, composing, merge fields, scheduled send, and tracking."
---

# Email

Warpdrive connects to Gmail over OAuth so that mail sent and received about a deal
shows up on the deal, without anyone copying and pasting.

Each user connects their own mailbox. See
[Email sync](../administration/email-sync.md) for connecting one. Admins can also
connect shared [team mailboxes](./team-mailboxes.md).

Support conversations from Intercom, when configured, show next to email in a
record's history. See [Intercom](./intercom.md).

## The Inbox

`/inbox` lists the threads in your connected mailbox, and `/inbox/[threadId]` opens
one.

![The inbox](/img/screenshots/email/inbox.png)

:::important
**Your personal mailbox is private.** Its threads show only to you. Colleagues do not
see your inbox, and you do not see theirs.

Sharing happens in two ways. A thread linked to a deal or a contact appears on that
deal or contact for everyone who can see it, so link a conversation to the record
instead of forwarding it. A [team mailbox](./team-mailboxes.md) is the exception to
the private inbox: its members see every thread in a **Team** section of the Inbox,
with one shared read state.
:::

### Inbox zero

When the Inbox folder is empty, Warpdrive shows an inbox-zero state. It appears only
on an unfiltered Inbox with no search active and a connected mailbox. An empty result
from a filter or a search shows the usual empty list instead.

## How sync works

Connecting a mailbox stores Gmail's **current** history cursor and begins applying
changes from that point forward.

:::caution
**Personal mailboxes have no backfill.** Mail already in the mailbox before you connect
it is not imported. Only messages that arrive afterwards are synced.

Team mailboxes differ: the admin picks 30, 90, or 180 days of history to import when
connecting. See [Team mailboxes](./team-mailboxes.md#history-import).
:::

Sync then polls Gmail's history, pages through the changes, and advances the cursor
only once every page has been applied. It processes added messages and Trash and
Spam transitions, rather than reconciling every Gmail label, so mail Gmail marks as
spam stays out of the Warpdrive Inbox.

Sync runs in the background worker process. If mail stops arriving in Warpdrive but
still arrives in Gmail, an absent worker is the first thing to check.

### When a mailbox disconnects itself

If Google rejects the stored credentials outright (an `invalid_grant` response),
Warpdrive disconnects the mailbox and discards the token, because the grant will not
recover on its own. Transient network failures and decryption errors do **not**
disconnect it.

Disconnecting is soft in both cases: the account row and everything already synced are
kept, so reconnecting picks up where it left off.

## How threads link to records

Linking is recorded on the **thread**, not on individual messages, so a whole
conversation belongs to a deal or a person rather than message by message.

The direction determines what is matched:

- **Inbound** messages match on the **sender** address.
- **Outbound** messages match on the **recipient** address.

A thread can be linked to a person, a deal, or both.

A few rules decide whether a link is made:

- Mail whose participants are all on your internal domain is not linked.
- If two people you can see share the sender's address, the thread is treated as an
  **ambiguous contact** and is not linked to either.
- A deal is linked automatically only when the matched person has exactly one open
  deal you can see. With none, or with several, the thread links to the person only
  and you choose the deal.

From a thread's sidebar, **Add new deal** opens the Add deal dialog with the thread's
linked contact already selected.

On the record itself, linked mail appears as cards in the timeline, one per message,
interleaved with activities and notes. See
[Deal workspace](./deal-workspace.md#email) for how they behave.

## Composing

`/inbox/compose` opens a full-page composer, and the same composer is available in
place on a deal or a contact.

![The composer](/img/screenshots/email/compose.png)

### Merge fields

A message body can contain `{{token}}` placeholders that are substituted at send time
from the linked records, covering person, deal, and organization fields.

Applying a template or choosing a field from **Insert field** puts the resolved value
into the body when the linked records have one. A token that cannot be resolved stays
as the literal `{{token}}` in the composer and is resolved when the message is sent;
if it still has no value then, it is removed. Anything written as literal text, for
example `[NAME]`, is sent exactly as typed and is not a merge field.

### Drafts

Drafts persist, including their visibility setting, so resuming a private draft keeps
it private.

A draft also remembers the deal or person it was written for. A message started from
a deal's Email tab keeps that link across autosave and resume, the deal shows your
own unsent drafts next to its sent mail, and sending files the message on that
record. Drafts stay private to their author: unsent text in your mailbox is not a
colleague's business.

### Logging as an activity

The composer's **Add as activity** toggle logs the sent message as a completed
activity on the linked record, so sent mail counts as done work on the
[Performance page](./dashboard.md) rather than piling up as open to-dos.

### Scheduled send

A message can be scheduled instead of sent immediately. Scheduled sends are performed
later by the background worker.

### Replies

A reply is sent into the same Gmail thread, using the `In-Reply-To` and `References`
headers, so it stays one conversation on both sides. Replying to a message you sent
yourself addresses the reply to that message's recipients, not to you.

### Open and link tracking

Outbound messages can be tracked. **Opens** records when a recipient opens the
message, and **Links** records clicks on links in it. Both are toggles in the
composer footer, and both can raise a [notification](./notifications.md).

## Signatures

A signature is embedded into the body when a new message is composed, rather than
appended at send. Resuming a draft therefore does not add it a second time.

## Permissions and visibility

Mail is subject to the same visibility rules as the record it is linked to. Linking a
thread to a deal makes it visible to everyone who can see that deal.

## Related

- [Email sync](../administration/email-sync.md), for connecting and troubleshooting a
  mailbox.
- [Team mailboxes](./team-mailboxes.md), for shared inboxes.
- [Intercom](./intercom.md), for support conversations in record history.
- [Deal workspace](./deal-workspace.md), where deal threads appear.
- [Contacts](./contacts.md), where person threads appear.
