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
