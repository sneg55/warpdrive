---
sidebar_position: 8
title: Single sign-on
description: "Sign-in providers, how accounts are matched to identities, the group gate for OIDC providers, and the admin action that rebinds a user to a new provider."
---

# Single sign-on

Warpdrive signs users in through an Identity Provider (IdP). Two kinds are supported, and they can
run side by side:

- **Google**, restricted to one Workspace domain through Google's hosted-domain claim. This is the
  original path.
- **Any OpenID Connect provider**: Authelia, Authentik, Keycloak, Entra ID, and so on. Access is
  gated by IdP groups.

Sign-in is independent of mail. Gmail connect runs its own OAuth consent with the Gmail scopes, so a
deployment that signs in through Authelia can still connect Google mailboxes afterwards.

## Choosing a provider

| Deployment | Configuration |
| --- | --- |
| Google Workspace only | Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_WORKSPACE_DOMAIN` |
| Google sign-in plus another IdP | The same Google values plus the `OIDC_*` values |
| Another IdP for sign-in, Gmail for mail | `OIDC_*` values, plus the Google values with `GOOGLE_SIGNIN_ENABLED=false` |
| Another IdP only, no Gmail | `OIDC_*` values with no Google values at all |

At least one sign-in provider is required in production. In development a deployment may have none
and use the dev-login route instead.

`GOOGLE_WORKSPACE_DOMAIN` is still required whenever Google values are set, because connecting a
mailbox checks the mailbox's hosted domain against it.

## Generic OIDC settings

| Variable | Meaning |
| --- | --- |
| `OIDC_ISSUER_URL` | The issuer as it appears in the provider's discovery document and ID tokens. Trailing slashes are ignored. Setting it turns OIDC on; the other three become required. |
| `OIDC_CLIENT_ID` | Client identifier registered with the provider. |
| `OIDC_CLIENT_SECRET` | Client secret. Sent with HTTP Basic authentication at the token endpoint. |
| `OIDC_ALLOWED_GROUPS` | Comma-separated group names. A sign-in succeeds only when the verified ID token's `groups` claim contains at least one of them. An empty list rejects everyone. |

Use an https issuer: Authelia refuses to start with a non-https session URL, and a self-signed
certificate has to be trusted by the app (`NODE_EXTRA_CA_CERTS`) and by the browser. Warpdrive reads
`/.well-known/openid-configuration` from the issuer at sign-in time and caches the result, so the
provider must be reachable from the app container.

Warpdrive strips trailing slashes from `OIDC_ISSUER_URL` once at startup and uses the normalized
value for discovery, the ID token `iss` check, and the stored sign-in identity. ID tokens are
accepted whether `iss` carries a trailing slash or not.

The client must be confidential and accept `client_secret_basic` at the token endpoint, the standard
HTTP Basic form. Redirect URI: `https://<your-domain>/auth/callback/oidc`.

The authorization request uses a PKCE S256 challenge, a nonce, and the scopes
`openid email profile groups`.

### What the provider must return

Warpdrive verifies the ID token signature against the provider's JWKS, checks the issuer, audience
and nonce, and reads these claims:

- `email`, which must be the user's workspace address, and `email_verified`, which must be true.
- `groups`, which the allow-list is checked against.
- `name` and `preferred_username`, both optional. When neither is present the local part of the
  email becomes the display name.

Providers that let you configure claims per client can suppress the default claim set. With
Authelia, a `claims_policies` entry replaces the defaults, so the policy has to list every claim
above rather than just `groups`.

### Groups grant access, not roles

Group membership decides who may sign in. Administrator status and permission sets stay managed
inside Warpdrive, under [Users and teams](./users-and-teams.md). Granting admin through the IdP is
not supported, so there is one source of truth for authorization.

## How accounts are matched

A user is keyed by email address and can hold several sign-in identities, one per provider. On
sign-in Warpdrive resolves, in order:

1. A known provider-plus-subject pair signs in that user.
2. An email with no identities yet is adopted. This is also how an invited user's placeholder is
   claimed, and how a user moves to a different provider.
3. An email that already holds a different identity is refused, **including across providers**.

The third rule is deliberate. An IdP that vouches for an email does not get to attach itself to an
existing account, so a compromised or misconfigured provider cannot silently take over the
workspace. To move a user to a new provider, an administrator uses **Reset sign-in identities** in
the row's actions menu on `/settings/users`; the next sign-in then adopts the account. Resetting also
revokes that user's sessions.

Changing an email address at the provider updates the existing profile; the identity pair, not the
address, is what identifies the account.

If an existing deployment was configured with a trailing slash in `OIDC_ISSUER_URL`, its stored
identity rows still contain that slash. Normalize them once after upgrading, otherwise affected
users hit the conflict rule above. Either run this against the database:

```sql
UPDATE user_identities
SET provider = regexp_replace(provider, '/+$', '')
WHERE provider ~ '^https?://';
```

or use **Reset sign-in identities** for each affected user. The Google and dev provider keys are not
URL-shaped and are unaffected.

## Gmail and SSO together

Connecting a personal mailbox requires the mailbox owner and the signed-in user to have the same
address on the deployment's Workspace domain. That check is unchanged by which provider signs the
user in, so the IdP has to report the user's workspace address as `email`. Shared team mailboxes
check only the domain. See [Email sync](./email-sync.md).

## Local development

The development Compose override runs Authelia 4.39 with a dev-only configuration. The issuer is
`https://authelia.localhost:9091`, which browsers resolve to the local machine; it serves a
certificate from a development CA generated on first start, so the browser shows a one-time warning
the first time. The app container trusts the same CA through `NODE_EXTRA_CA_CERTS`.

Sign-in users, all with the password `warpdrive-dev`:

| Address | Group | Result |
| --- | --- | --- |
| `admin@example.com` | `warpdrive-users` | signs in |
| `colleague@example.com` | `warpdrive-users` | signs in as a second user |
| `outsider@example.com` | `other-team` | rejected by the group gate |

The keys, certificate and client secret are generated into `contrib/authelia/generated/`, which git
ignores, and exist only for local development. Delete the contents of that directory, keeping its
`.gitignore`, to generate new ones. They are not meant for a real deployment.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Login page shows no buttons | No provider configured for this environment. Check `GOOGLE_SIGNIN_ENABLED` and `OIDC_ISSUER_URL`. |
| Returned to the login page with a "Sign-in failed" alert | Provider unreachable, discovery document invalid, nonce or state mismatch, signature failure, unverified email, or no allowed group. The alert never says which; the app log does. |
| `identity_conflict` in the log | The email already holds a different identity. Reset sign-in identities for that user. |
| Signed in but the email looks wrong | The IdP is not returning the workspace address, so personal Gmail binding will refuse it. |
