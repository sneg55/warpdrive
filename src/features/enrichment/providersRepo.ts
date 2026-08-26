// Provider credentials, the admin's toggles, and the runtime's throttle state. API keys are
// AES-256-GCM at rest and leave this module in plaintext only on the way to a provider client.
import { and, eq, isNotNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type EnrichmentProviderRow, enrichmentProviders } from "@/db/schema/enrichment";
import { decryptToken, encryptToken } from "@/features/email/crypto";
import { err, ok, type Result } from "@/types/result";
import { ENRICHMENT_PROVIDER_IDS, type ProviderId, type ProviderOutcome } from "./providers/types";

const KEY_HINT_LENGTH = 4;
const DEFAULT_CACHE_TTL_DAYS = 30;

export { DEFAULT_CACHE_TTL_DAYS };

// What the settings page is allowed to see: no key material, only the trailing hint.
export interface ProviderView {
  provider: ProviderId;
  enabled: boolean;
  hasKey: boolean;
  apiKeyHint: string | null;
  throttledUntil: Date | null;
  throttleReason: string | null;
  needsAttention: boolean;
  lastOkAt: Date | null;
}

export interface UsableProvider {
  provider: ProviderId;
  apiKey: string;
  // The stored ciphertext this key came from. recordOutcome writes only against it, so an answer
  // produced by a credential an admin has since replaced cannot badge or cool down the new one.
  credential: Buffer;
}

const UNCONFIGURED = {
  enabled: false,
  hasKey: false,
  apiKeyHint: null,
  throttledUntil: null,
  throttleReason: null,
  needsAttention: false,
  lastOkAt: null,
} as const;

function toView(row: EnrichmentProviderRow): ProviderView {
  return {
    provider: row.provider,
    enabled: row.enabled,
    hasKey: row.apiKeyEncrypted !== null,
    apiKeyHint: row.apiKeyHint,
    throttledUntil: row.throttledUntil,
    throttleReason: row.throttleReason,
    needsAttention: row.needsAttention,
    lastOkAt: row.lastOkAt,
  };
}

export async function listProviders(db: Db, signal: AbortSignal): Promise<ProviderView[]> {
  signal.throwIfAborted();
  const rows = await db.select().from(enrichmentProviders);
  const byId = new Map(rows.map((r) => [r.provider, r]));
  // A provider with no row is simply unconfigured, and the page still has to list all three.
  return ENRICHMENT_PROVIDER_IDS.map((provider) => {
    const row = byId.get(provider);
    return row === undefined ? { provider, ...UNCONFIGURED } : toView(row);
  });
}

// Enabled, credentialled, and not sitting out a cooldown. Throttled providers drop out here rather
// than at the call site, so a fan-out never spends a request it already knows will 429.
export async function listUsableProviders(
  db: Db,
  now: Date,
  signal: AbortSignal,
  // The settings page tests a key BEFORE switching the provider on, so that one caller needs the
  // decrypt path without the enabled filter.
  opts: { ignoreEnabled?: boolean } = {},
): Promise<UsableProvider[]> {
  signal.throwIfAborted();
  const rows =
    opts.ignoreEnabled === true
      ? await db.select().from(enrichmentProviders)
      : await db.select().from(enrichmentProviders).where(eq(enrichmentProviders.enabled, true));

  const usable: UsableProvider[] = [];
  for (const row of rows) {
    if (row.apiKeyEncrypted === null) continue;
    if (row.throttledUntil !== null && row.throttledUntil > now) continue;
    const decrypted = decryptToken(row.apiKeyEncrypted);
    // A key we cannot decrypt is a server-side key problem, not a provider problem. Dropping this
    // one provider degrades the fan-out instead of failing it.
    if (!decrypted.ok) continue;
    usable.push({
      provider: row.provider,
      apiKey: decrypted.value,
      credential: row.apiKeyEncrypted,
    });
  }
  return usable;
}

export async function setProviderKey(
  db: Db,
  provider: ProviderId,
  plaintext: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const trimmed = plaintext.trim();
  const encrypted = encryptToken(trimmed);
  const hint = trimmed.slice(-KEY_HINT_LENGTH);
  // A new key clears the rejected badge and any cooldown: both describe the credential it replaces.
  const fresh = {
    apiKeyEncrypted: encrypted,
    apiKeyHint: hint,
    needsAttention: false,
    throttledUntil: null,
    throttleReason: null,
  };
  await db
    .insert(enrichmentProviders)
    .values({ provider, ...fresh })
    .onConflictDoUpdate({ target: enrichmentProviders.provider, set: fresh });
}

export async function clearProviderKey(
  db: Db,
  provider: ProviderId,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db
    .update(enrichmentProviders)
    .set({ apiKeyEncrypted: null, apiKeyHint: null, enabled: false, needsAttention: false })
    .where(eq(enrichmentProviders.provider, provider));
}

export async function setProviderEnabled(
  db: Db,
  provider: ProviderId,
  enabled: boolean,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  // Enabling a provider with no credential would put it in every fan-out only to fail on auth.
  // The check is the WHERE of the write, not a read before it: between a read that saw a key and
  // an unconditional upsert, a Remove key can land and leave an enabled row with none.
  if (enabled) {
    const [row] = await db
      .update(enrichmentProviders)
      .set({ enabled: true })
      .where(
        and(
          eq(enrichmentProviders.provider, provider),
          isNotNull(enrichmentProviders.apiKeyEncrypted),
        ),
      )
      .returning({ provider: enrichmentProviders.provider });
    return row === undefined
      ? err(new AppError(ERROR_IDS.ENRICH_NO_KEY, "provider has no API key", { provider }))
      : ok(undefined);
  }
  await db
    .insert(enrichmentProviders)
    .values({ provider, enabled: false })
    .onConflictDoUpdate({
      target: enrichmentProviders.provider,
      set: { enabled: false },
    });
  return ok(undefined);
}

// The runtime's half of the row: cooldowns and the rejected badge. It never touches `enabled`,
// because a temporary 429 must not silently disconnect a provider an admin switched on.
export async function recordOutcome(
  db: Db,
  outcome: ProviderOutcome,
  credential: Buffer,
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const patch = patchFor(outcome, now);
  if (patch === null) return;
  await db
    .update(enrichmentProviders)
    .set(patch)
    .where(
      and(
        eq(enrichmentProviders.provider, outcome.provider),
        eq(enrichmentProviders.apiKeyEncrypted, credential),
      ),
    );
}

type ProviderPatch = Partial<typeof enrichmentProviders.$inferInsert>;

function patchFor(outcome: ProviderOutcome, now: Date): ProviderPatch | null {
  switch (outcome.kind) {
    case "ok":
    case "no_match": {
      const patch: ProviderPatch = { lastOkAt: now, needsAttention: false };
      // Apollo reports remaining quota on a successful call, so a provider can hand us a cooldown
      // without ever returning a 429.
      if (outcome.retryAfterIso !== undefined) {
        patch.throttledUntil = new Date(outcome.retryAfterIso);
        patch.throttleReason = "throttled";
      }
      return patch;
    }
    case "auth":
      return { needsAttention: true };
    case "not_entitled":
      return { needsAttention: false };
    case "throttled":
    case "quota":
      return {
        throttledUntil:
          outcome.retryAfterIso !== undefined ? new Date(outcome.retryAfterIso) : null,
        throttleReason: outcome.kind,
      };
    case "timeout":
    case "provider_error":
    case "skipped":
    case "unsupported":
    case "key_unreadable":
      return null;
  }
}
