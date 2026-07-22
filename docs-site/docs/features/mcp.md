---
sidebar_position: 14
title: MCP server
description: "Connect AI assistants (Claude, ChatGPT, Cursor) to Warpdrive over an OAuth-authenticated MCP server: enabling it, connecting a client, the available tools, permissions, and revoking access."
---

# MCP server

Warpdrive exposes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server so AI assistants like Claude, ChatGPT, and Cursor can search your CRM and act
on it in natural language: find deals, log activities, update records, add notes.

Every action runs as the Warpdrive user who signed in, and is bounded by that user's
existing permissions and visibility rules. Connecting an assistant never grants it more
access than you already have.

:::important
**The server has no delete tools.** There is no way to delete, remove, archive, or
destroy a record through MCP. It reads, creates, and updates only.
:::

## Enabling the server

The MCP server is on by default and needs one secret: a signing key for the access
tokens it issues. Generate a 32-byte key encoded as base64:

```sh
openssl rand -base64 32
```

Set it in your Warpdrive environment (the box `.env`):

```dotenv
MCP_ENABLED=true
OAUTH_SIGNING_KEY=<the-generated-base64-value>
```

:::caution
Keep `OAUTH_SIGNING_KEY` secret and stable. Rotating it invalidates every issued MCP
token, so connected clients must reconnect. It is required whenever `MCP_ENABLED` is
true, and the app will refuse to start without a valid 32-byte key. Docker secret
deployments can instead point `OAUTH_SIGNING_KEY_FILE` at a file holding the key.
:::

Make sure `BASE_URL` is the public HTTPS origin your clients reach Warpdrive at. When
`MCP_ENABLED=false`, the MCP and OAuth endpoints return HTTP 404.

## Connecting a client

The remote MCP endpoint is:

```text
https://<your-domain>/api/mcp
```

Warpdrive is a full OAuth 2.1 authorization server: it handles discovery, dynamic
client registration, the authorization code flow, and PKCE (S256), and it delegates the
actual login to your existing Google sign-in. So connecting is a one-click "sign in and
approve", with no API keys to copy.

To connect from Claude or Claude Desktop:

1. Open **Settings**, then **Connectors**.
2. Select **Add custom connector**. Team and Enterprise owners may need to add it under
   Organization connectors first.
3. Enter a name such as `Warpdrive` and the endpoint URL above.
4. Select **Connect**, sign in to Warpdrive, review the consent screen, and approve.
5. Enable the Warpdrive tools you want from **Search and tools** in a conversation.

See Anthropic's [custom connector guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
for current client controls. Any MCP client that supports remote Streamable HTTP servers
with OAuth can use the same endpoint.

## Tools

**Read**

- `search` (across everything)
- `list_deals`, `get_deal`
- `list_leads`, `get_lead`
- `list_persons`, `get_person`
- `list_organizations`, `get_organization`
- `list_activities`, `get_activity`
- `list_pipelines`, `get_pipeline`
- `pipeline_summary`

**Write**

- `create_deal`, `update_deal`, `move_deal_stage`
- `create_lead`, `update_lead`, `convert_lead_to_deal`
- `create_person`, `update_person`
- `create_organization`, `update_organization`
- `create_activity`, `update_activity`, `complete_activity`
- `add_note`

## Permissions and safety

MCP acts as the user who completed the OAuth sign-in. Your visibility rules and
permission flags apply to every call: a record you cannot see is not readable through
MCP, and an action you lack permission for is denied through MCP the same way it is in
the app. Every write is recorded in the change log, attributed to you, exactly like a
change made in the UI.

:::tip
Review the assistant's write requests before approving them in your client. The server
has no delete tools, so the worst an approved write can do is create or change a record,
never remove one.
:::

## Revoking a connection

Open **Settings**, then **Connected apps**. Each connected client is listed with when it
connected and when it was last used. Select **Revoke** to invalidate all of its access
and refresh tokens for your account. The client must complete the sign-in again before
it can reach Warpdrive. You can also remove the connector from the client's own settings.
