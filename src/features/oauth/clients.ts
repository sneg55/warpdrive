import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { oauthClients } from "@/db/schema/oauth";

// Registration is open to the internet by default (that is what lets an MCP client self-onboard
// via RFC 7591), so both accepted fields are attacker-controlled and both matter: redirect_uris
// becomes the target an authorization code is handed to, and client_name is the text a user reads
// on the consent screen while deciding whether to grant CRM access.

// Schemes that must never be a redirect target. z.string().url() delegates to `new URL()`, which
// accepts every one of these. Browsers refuse to follow them from a Location header, so this is
// not a live XSS hole today; it is closed because "the browser happens to save us" is not a
// validation strategy, and because a non-browser client following its own registered URI has no
// such protection.
const DANGEROUS_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "blob:",
  "vbscript:",
  "about:",
  "filesystem:",
]);

const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 128;
const DEFAULT_CLIENT_NAME = "Unnamed client";

// RFC 8252 section 7.3. `new URL().hostname` keeps the brackets on an IPv6 literal.
function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function isAllowedRedirectUri(raw: string): boolean {
  if (raw.length > MAX_REDIRECT_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // RFC 6749 section 3.1.2: the redirection endpoint must not include a fragment.
  if (url.hash !== "") return false;
  if (DANGEROUS_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return true;
  // Plain http would put the authorization code on the wire in clear, except on loopback where
  // it never leaves the machine and a native client has no alternative.
  if (url.protocol === "http:") return isLoopbackHost(url.hostname);
  // Anything else is a private-use scheme (RFC 8252 section 7.1). Real MCP clients register
  // these (vscode://, cursor://, com.example.app:/cb), so they cannot be blanket-rejected; the
  // dangerous ones were already removed above.
  return true;
}

// Codepoints that must not survive into a rendered client name. Expressed as a predicate rather
// than a character-class regex on purpose: a regex spelling this out is both harder to read and
// trips the linter's control-character rule, which exists to catch exactly the accident this is
// deliberately doing.
//
// The consent screen renders this name and React escapes it, so this is not about XSS. It is
// about an unauthenticated stranger controlling the text a user reads while deciding whether to
// hand over their CRM. RIGHT-TO-LEFT OVERRIDE (U+202E) in particular reverses the rendering of
// everything after it, which is the standard trick for making one string display as another.
function isUnsafeNameCodePoint(code: number): boolean {
  const isC0 = code <= 0x1f;
  const isC1 = code >= 0x7f && code <= 0x9f;
  // LRM/RLM, the embedding and override controls, and the isolate controls.
  const isBidi =
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069);
  return isC0 || isC1 || isBidi;
}

export function sanitizeClientName(raw: string): string {
  const stripped = Array.from(raw)
    .filter((ch) => !isUnsafeNameCodePoint(ch.codePointAt(0) ?? 0))
    .join("");
  // Collapse runs of whitespace so a name cannot be padded out to shove the rest of the screen
  // around, then fall back to a neutral label if nothing meaningful is left.
  const cleaned = stripped.replace(/\s+/g, " ").trim();
  return cleaned === "" ? DEFAULT_CLIENT_NAME : cleaned;
}

export const clientRegistrationInput = z.object({
  client_name: z.string().max(MAX_CLIENT_NAME_LENGTH).optional(),
  redirect_uris: z
    .array(z.string().url().refine(isAllowedRedirectUri))
    .min(1)
    .max(MAX_REDIRECT_URIS),
});

interface RegisterClientInput {
  name: string;
  redirectUris: string[];
}

export async function registerClient(
  db: Db,
  input: RegisterClientInput,
  signal: AbortSignal,
): Promise<{ clientId: string }> {
  signal.throwIfAborted();
  const clientId = randomUUID();
  await db.insert(oauthClients).values({ id: clientId, ...input });
  signal.throwIfAborted();
  return { clientId };
}

export async function getClient(db: Db, clientId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId));
  signal.throwIfAborted();
  return client;
}
