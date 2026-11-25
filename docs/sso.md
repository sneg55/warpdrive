# Single sign-on

Warpdrive signs users in through an Identity Provider (IdP). Two are supported and can run together:

- **Google**: Google Workspace via the `hd` claim, the original path.
- **Generic OIDC**: any OpenID Connect provider (Authelia, Authentik, Keycloak, ...), gated by IdP groups.

Sign-in is separate from mail. Gmail connect is its own OAuth consent with Gmail scopes, so a
workspace can sign in through an OIDC provider and still connect Gmail afterwards.

## Configuration

Google:

- `GOOGLE_SIGNIN_ENABLED` (default: true when `GOOGLE_OAUTH_CLIENT_ID` is set)
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_WORKSPACE_DOMAIN` (required when Google sign-in or Gmail connect is used)

Generic OIDC:

- `OIDC_ISSUER_URL` enables the provider; `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
  `OIDC_ALLOWED_GROUPS` become required with it.
- `OIDC_ISSUER_URL` is normalized by removing trailing slashes at the env boundary. The normalized
  value is used for discovery, for the ID token `iss` check and as the stored sign-in identity
  provider key. ID tokens are accepted when `iss` has the same value with or without a trailing
  slash.
- `OIDC_ALLOWED_GROUPS` is a comma-separated list. A sign-in succeeds only when the verified ID
  token's `groups` claim contains at least one of them; an empty list therefore rejects everyone.
  This is fail-closed on purpose.
- Groups grant access only. Admin status and permission sets stay managed in Warpdrive.

Production requires at least one sign-in provider. In development a workspace may run with none and
use the dev-login route instead.

The provider must report the user's workspace address as the verified `email` claim, because binding
a personal Gmail account requires that address to match the signed-in user.

## Issuer normalization

`OIDC_ISSUER_URL` is normalized once at startup, so the same issuer with and without a trailing
slash produces the same provider key. If a deployment previously ran with a trailing slash, its
`user_identities.provider` rows still contain that slash. After upgrading, the next sign-in misses
the known identity and is refused as an identity conflict because the email already holds another
identity. Normalize the existing rows once, or reset sign-in identities for each affected user:

```sql
UPDATE user_identities
SET provider = regexp_replace(provider, '/+$', '')
WHERE provider ~ '^https?://';
```

The Google and dev provider keys are not URL-shaped and are unaffected.

## Identity matching

A User is keyed by email and can hold several Sign-in identities, one per provider. On sign-in:

1. A known (provider, subject) identity signs in that User.
2. An email with no identities yet is adopted (this is how invited users and provider migrations
   complete).
3. An email already holding a different identity is rejected as a conflict, across providers too.
   Resolution is the admin action **Reset sign-in identities**, after which the next sign-in adopts
   the User.

That conflict rule is deliberate: an IdP that vouches for an email does not get to attach itself to
an existing account, so a compromised or misconfigured provider cannot take over the workspace
silently.

## Local development with Authelia

`docker-compose.dev.yml` runs Authelia 4.39.28 with configuration in `contrib/authelia/`. The
configuration commits no key, certificate or secret: they are generated on first start.

- Issuer: `https://authelia.localhost:9091`. Browsers resolve `*.localhost` to `127.0.0.1`; the
  compose network aliases the same hostname so the app container resolves the identical issuer.
- TLS: Authelia rejects a non-https `authelia_url` for its session cookie, so the dev IdP serves a
  generated certificate signed by a generated dev CA. The app container trusts that CA through
  `NODE_EXTRA_CA_CERTS`. A browser that has not imported the CA shows a one-time warning for
  `authelia.localhost:9091`; accept it for local development.
- Generated material: the one-shot `authelia-init` service runs `contrib/authelia/generate.sh` with
  the Authelia image's own `authelia crypto` commands and writes the CA, the certificate chain, the
  OIDC signing key, the session, storage and HMAC secrets and the OIDC client secret (plus its
  PBKDF2 digest) into `contrib/authelia/generated/`, which git ignores. A start that finds every
  file keeps them, so sessions survive restarts. Delete everything in that directory except its
  `.gitignore` to start over: the next start issues a new CA, so restart the app and re-accept the
  browser warning.
- Redirect URI: `http://localhost:3000/auth/callback/oidc`
- Consent: `consent_mode: implicit`, so signing in returns straight to the callback instead of
  showing a consent screen.
- Users (password `warpdrive-dev`): `admin@example.com` and `colleague@example.com` (group
  `warpdrive-users`, allowed), plus `outsider@example.com` (group `other-team`, rejected by the
  group gate).

Start the stack, then use **Sign in with SSO** on the login page. The app container receives
`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_ALLOWED_GROUPS`, `NODE_EXTRA_CA_CERTS` and
`OIDC_CLIENT_SECRET_FILE` from the compose file, the last two pointing into
`contrib/authelia/generated/`. An app running directly on the host needs the same two variables with
host paths: `NODE_EXTRA_CA_CERTS` in the shell that starts it, because Node reads it at launch.

### Claims policy gotcha

Setting a `claims_policies` entry on the client replaces the default ID token claim set: a policy
listing only `groups` makes Authelia omit `email`, so every sign-in is rejected. The committed policy
therefore lists every claim the app reads: `email`, `email_verified`, `name`, `preferred_username`
and `groups`. `contrib/authelia/configuration.test.ts` guards this, along with the files the
configuration reads from `generated/` and the issuer shared with the compose file.

### Verifying the IdP config without a browser

`authelia validate-config --config.experimental.filters template` catches every configuration error
at once, and the committed tests cover the invariants. When an `authelia` binary is on the `PATH`,
the same test file also runs `generate.sh` into a temporary directory, checks the certificate chain,
the secrets and the client secret digest, and validates the configuration against them. To see what
the provider actually emits, sign in once with the stack running: the name and email shown under
Settings, Users come from the ID token claims, and the app log names the reason for any rejection.

## Storage of credentials

Nothing in `contrib/` commits a key, a certificate or a secret, so a secret scanner over the whole
tree finds nothing. `contrib/authelia/configuration.yml` reads each value from a file in
`contrib/authelia/generated/` through Authelia's template filter, and a test fails if a private key,
a 64 character hex secret or a PBKDF2 digest is committed there. `.gitleaks.toml` exempts only the
generated directory, so a scan on a machine that has started the stack stays clean while a key placed
anywhere else is still reported. The dev users in `users_database.yml` carry argon2id digests of the
documented throwaway password `warpdrive-dev`. A real deployment generates its own keys and
certificate. Nothing in `contrib/` is meant to run in production.
