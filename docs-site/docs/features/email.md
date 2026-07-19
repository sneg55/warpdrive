---
sidebar_position: 6
title: Email
description: "Two-way Gmail in Warpdrive: connecting a mailbox, how sync works, how threads link to deals and contacts, composing, merge fields, scheduled send, and tracking."
---

# Email

Warpdrive connects to Gmail over OAuth so that mail sent and received about a deal
shows up on the deal, without anyone copying and pasting.

Each user connects their own mailbox. See
[Email sync](../administration/email-sync.md) for connecting one.

## The Inbox

`/inbox` lists the threads in your connected mailbox, and `/inbox/[threadId]` opens
one.

![The inbox](/img/screenshots/email/inbox.png)

:::important
**The Inbox folder is personal.** It shows only your own mail. Colleagues do not see
your inbox, and you do not see theirs.

Shared visibility happens on the **record**: a thread linked to a deal or a contact
appears on that deal or contact for everyone who can see it. If you want a colleague
to see a conversation, link it to the record, not forward it.
:::

## How sync works

Connecting a mailbox stores Gmail's **current** history cursor and begins applying
changes from that point forward.

:::caution
**There is no backfill.** Mail already in the mailbox before you connect it is not
imported. Only messages that arrive afterwards are synced.
:::

Sync then polls Gmail's history, pages through the changes, and advances the cursor
only once every page has been applied. It processes added messages and Trash
transitions, rather than reconciling every Gmail label.

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

## Composing

`/inbox/compose` opens a full-page composer, and the same composer is available in
place on a deal or a contact.

![The composer](/img/screenshots/email/compose.png)

### Merge fields

A message body can contain `{{token}}` placeholders that are substituted at send time
from the linked records, covering person, deal, and organization fields.

Substitution happens **server side, at send**. What you see in the composer is the
token; what the recipient receives is the value. Anything written as literal text, for
example `[NAME]`, is sent exactly as typed and is not a merge field.

### Drafts

Drafts persist, including their visibility setting, so resuming a private draft keeps
it private.

### Scheduled send

A message can be scheduled instead of sent immediately. Scheduled sends are performed
later by the background worker.

### Open tracking

Outbound messages can be tracked, recording when a recipient opens them.

## Signatures

A signature is embedded into the body when a new message is composed, rather than
appended at send. Resuming a draft therefore does not add it a second time.

## Permissions and visibility

Mail is subject to the same visibility rules as the record it is linked to. Linking a
thread to a deal makes it visible to everyone who can see that deal.

## Related

- [Email sync](../administration/email-sync.md), for connecting and troubleshooting a
  mailbox.
- [Deal workspace](./deal-workspace.md), where deal threads appear.
- [Contacts](./contacts.md), where person threads appear.
