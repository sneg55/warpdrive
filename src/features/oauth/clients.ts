import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { oauthClients } from "@/db/schema/oauth";

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

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isAllowedRedirectUri(raw: string): boolean {
  if (raw.length > MAX_REDIRECT_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash !== "") return false;
  if (DANGEROUS_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return isLoopbackHost(url.hostname);
  return true;
}

function isUnsafeNameCodePoint(code: number): boolean {
  const isC0 = code <= 0x1f;
  const isC1 = code >= 0x7f && code <= 0x9f;
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
