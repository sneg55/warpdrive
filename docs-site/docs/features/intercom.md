---
sidebar_position: 7
title: Intercom
description: "Show Intercom support conversations in the history of people, deals, and leads: connecting a private app, how syncing and matching work, and what is shown."
---

# Intercom

Warpdrive can pull support conversations from Intercom and show them in the history of
the matching person, deal, and lead. Before a call, you can see whether the contact
has recently written to support, without opening Intercom.

The integration is read-only. Warpdrive never writes to Intercom.

## Where conversations appear

Conversations show as cards in the history feed of:

- a **person**
- a **deal**
- a **lead**

On people and deals they are also listed under the **Email** filter of the history, next
to email threads. Each card shows the conversation title or opening text, a state
badge (Open, Closed, or Snoozed), the date of the last message, the message count, and
who replied last. Expand a card to read the conversation. The card is read-only.

Without a configured token, none of this appears.

## Setting it up

1. In your Intercom workspace, open the Developer Hub and create a **private app**.
2. Give the app read access to **contacts** and **conversations**.
3. Copy the app's access token.
4. Set these in the deployment environment and restart:

   - `INTERCOM_ACCESS_TOKEN`, the token. `INTERCOM_ACCESS_TOKEN_FILE` is also accepted,
     pointing at a file that holds it.
   - `INTERCOM_REGION`, one of `us`, `eu`, or `au`. The default is `us`. Use the region
     your Intercom workspace is hosted in.

An empty token leaves the feature off.

## How syncing works

A background job in the worker syncs every 5 minutes. Each run stops after 4 minutes,
and the next run continues where it left off.

- The first run backfills the last 12 months (365 days) of conversations. A large
  workspace takes many runs to finish the backfill.
- Later runs fetch changes since the last run, with a 5-minute overlap so nothing near
  the boundary is missed.
- Intercom contacts are cached and refreshed every 7 days.

Because the job runs in the worker, check that the worker is running if conversations
never arrive.

## How conversations match records

Matching uses **email address only**. A conversation belongs to a person when one of
its Intercom contacts has an email that equals the person's primary email or any of
their additional emails, ignoring case.

- A conversation shows on **every** matching person.
- A deal shows the conversations of its person and its participants.
- Contacts whose address starts with `noreply`, `no-reply`, `donotreply`,
  `do-not-reply`, or `mailer-daemon` are never matched.

## Visibility

Conversations show only on people, deals, and leads you are allowed to see. The
history lists the most recent 200 conversations.

## What is shown

Only the opening message and the comment parts of a conversation are shown. Admin
notes, redacted or empty parts, and every other kind of part are dropped. Remote
images in a message are blocked until the viewer chooses to allow them.

## Troubleshooting

**Contacts sync but no conversations appear.** The private app's token cannot read
conversations. Open the app in Intercom's Developer Hub, add read access to
conversations, and let the next sync run.

**Nothing appears at all.** Confirm the token is set and the service was restarted,
that `INTERCOM_REGION` matches your workspace, and that the worker is running. Then
check that the person's email in Warpdrive matches the email on the Intercom contact.

## Related

- [Email](./email.md), whose history the conversations sit next to.
- [Contacts](./contacts.md)
- [Deal workspace](./deal-workspace.md)
