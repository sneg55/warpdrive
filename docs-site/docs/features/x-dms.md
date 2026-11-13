---
sidebar_position: 8
title: X direct messages
description: "Work X (Twitter) direct messages from Warpdrive: creating the X developer app, connecting an account as an admin, sharing it with the team, and the limits of the X API."
---

# X direct messages

Warpdrive can sync the direct messages of an X account and let your team read and answer
them from the shared inbox, next to your team mailboxes. Each connected X account is
shared with the members an admin chooses.

Without both `X_CLIENT_ID` and `X_CLIENT_SECRET`, none of this appears.

## Setting it up

1. In the [X developer console](https://developer.x.com), create a project and an app.
2. Open the app's user authentication settings and turn on **OAuth 2.0**.
3. Set the app type to **Web App, Automated App or Bot**.
4. Set the app permissions to **Read and write and Direct message**.
5. Set the callback URL to `<BASE_URL>/api/x/oauth/callback`, where `<BASE_URL>` is the
   `BASE_URL` of your deployment.
6. Copy the OAuth 2.0 client ID and client secret.
7. Make sure the developer account has pay-per-use credits. The X API bills each request
   it serves, and syncing stops being useful when credits run out.
8. Set these in the deployment environment and restart:

   - `X_CLIENT_ID`, the client ID.
   - `X_CLIENT_SECRET`, the client secret.

## Connecting an account

Only administrators connect accounts.

1. Open **Settings**, then **Team mailboxes**. The **X accounts** section sits below the
   mailboxes.
2. Choose **Connect X account** and sign in to X as the account you want to connect.
3. Approve the access request. You return to the settings page with a confirmation.

For each account you can set a display name, how many hours a conversation waits before
it counts as overdue, and which members can work its conversations. **Save X account**
stores the changes. **Disconnect** revokes the connection and removes the account and its
stored conversations, after a confirmation.

If X rejects the stored credentials, the account shows **Reconnect required** with an
error ID. Choose **Reconnect** and approve again. The account keeps its members and
settings.

## How syncing works

A background job in the worker syncs every 2 minutes. The first run imports only the last
30 days of conversations. Replies you send from Warpdrive are sent as the connected X
account and show the name of the member who wrote them.

Because the job runs in the worker, check that the worker is running if messages never
arrive.

## Limitations

- **Message requests.** Direct messages that X files as message requests do not appear in
  Warpdrive until the request is accepted in the X app.
- **Encrypted conversations.** End-to-end encrypted conversations are listed, but their
  messages are not readable here. Answer them in the X app. Messages already stored from
  before a conversation became encrypted stay visible.
- **Reply limit.** X allows 15 replies per 15 minutes for each connected account. Sending
  past that limit fails with an error until the window passes.
- **Group conversations and media.** Group direct messages are not supported, and
  Warpdrive sends text only, not images or other media.

## Troubleshooting

**The Connect button does nothing or the page shows an error after signing in.** Check
that the callback URL in the X app matches `<BASE_URL>/api/x/oauth/callback` exactly and
that the app permissions include direct messages.

**An account shows Reconnect required.** Reconnect it from the settings page. The error
ID shown is the one to quote when asking for help.

**Nothing appears at all.** Confirm both variables are set and the service was restarted,
that the worker is running, and that the developer account still has credits.

## Related

- [Team mailboxes](./team-mailboxes.md), whose settings page hosts the X accounts.
- [Email](./email.md)
