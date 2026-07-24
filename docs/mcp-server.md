# Warpdrive MCP server

Warpdrive exposes an OAuth-authenticated Model Context Protocol server for CRM reads and writes. It lets compatible AI clients search CRM data and create or update records without granting more access than the signed-in Warpdrive user already has.

The server does not expose delete, remove, archive, or destroy tools.

## Enable the server

Generate a 32-byte signing key encoded as base64:

```sh
openssl rand -base64 32
```

Set these values in the Warpdrive environment:

```dotenv
MCP_ENABLED=true
OAUTH_SIGNING_KEY=<generated-base64-value>
```

Docker secret deployments may set `OAUTH_SIGNING_KEY_FILE` to a file containing the key instead. Keep this key secret and stable across app restarts. Ensure `BASE_URL` is the public HTTPS origin clients use to reach Warpdrive.

When `MCP_ENABLED=false`, the MCP and OAuth endpoints return HTTP 404.

### Locking down client registration

`OAUTH_REGISTRATION` controls RFC 7591 dynamic client registration, and defaults to `open`.

Open registration is what makes "paste the server URL into your MCP client" work: the client
POSTs to `/oauth/register` with no credential and gets a `client_id` back. The cost is that
anyone on the internet can do the same, and the `client_name` they supply is the text your users
read on the consent screen. That is the setup for consent phishing: register a client called
something reassuring, send a signed-in user the authorize link, and a single "Allow access" hands
over an access token with that user's full CRM permissions.

Three things reduce that risk out of the box. The consent screen presents the name as
self-reported rather than in the product's own voice and shows the host the grant will be sent
to; registration is rate limited per address; and the app refuses to be framed, so the consent
screen cannot be clickjacked.

Once you have connected the clients you need, close the door:

```dotenv
OAUTH_REGISTRATION=disabled
```

Existing clients and their grants keep working. `/oauth/register` returns 404 and
`registration_endpoint` disappears from `/.well-known/oauth-authorization-server`, so discovery
reflects the policy instead of pointing clients at a dead endpoint. Set it back to `open`
temporarily when you need to onboard another client.

Registered redirect URIs must be `https`, `http` on a loopback address (RFC 8252 for native
apps), or a private-use scheme such as `vscode://`. Plain `http` to a remote host is refused,
as are `javascript:`, `data:`, `file:` and similar.

## Connect a client

The remote MCP endpoint is:

```text
https://<domain>/api/mcp
```

Warpdrive supports Streamable HTTP, OAuth discovery, dynamic client registration, authorization code flow, and PKCE with S256.

To connect from Claude or Claude Desktop:

1. Open Settings, then Connectors.
2. Select Add custom connector. Team and Enterprise owners may need to add it under Organization connectors first.
3. Enter a name such as `Warpdrive` and the endpoint URL above.
4. Select Connect, sign in to Warpdrive, review the consent screen, and approve access.
5. Enable the Warpdrive tools you want to use from Search and tools in a conversation.

Remote connectors are added through Settings in Claude Desktop, not through `claude_desktop_config.json`. See Anthropic's [custom connector guide](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp) for current client controls.

Other MCP clients can use the same endpoint when they support remote Streamable HTTP servers and OAuth.

## Tools

Read tools:

- `search`
- `list_deals`, `get_deal`
- `list_leads`, `get_lead`
- `list_persons`, `get_person`
- `list_organizations`, `get_organization`
- `list_activities`, `get_activity`
- `list_pipelines`, `get_pipeline`
- `pipeline_summary`

Write tools:

- `create_deal`, `update_deal`, `move_deal_stage`
- `create_lead`, `update_lead`, `convert_lead_to_deal`
- `create_person`, `update_person`
- `create_organization`, `update_organization`
- `create_activity`, `update_activity`, `complete_activity`
- `add_note`

## Permissions and safety

MCP acts as the user who completed OAuth. Existing Warpdrive visibility rules and permission flags apply to every tool call. A user who cannot see a record cannot read it through MCP, and a user without a required edit or create permission receives the same denial through MCP.

Review write-tool requests in the client before approving them. The server intentionally has no delete tools.

## Revoke a connection

In Warpdrive, open Settings, then Connected apps. Select Revoke beside a client to revoke all of its access and refresh tokens for your account. The client must complete OAuth again before it can use Warpdrive.

You can also remove the connector configuration from the client's Connectors settings.
