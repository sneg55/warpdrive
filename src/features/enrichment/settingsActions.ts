"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { clearMapping, setCacheTtlDays, upsertMapping } from "./mappingsRepo";
import type { QuotaRemaining } from "./providers/types";
import { ENRICHMENT_PROVIDER_IDS } from "./providers/types";
import { clearProviderKey, setProviderEnabled, setProviderKey } from "./providersRepo";
import { testProvider } from "./testProvider";

const MAX_TTL_DAYS = 365;

type ActionResult = { ok: true } | { ok: false; error: { id: string } };

export type TestProviderActionResult =
  | { ok: true; kind: string; quotaRemaining?: QuotaRemaining; notEntitled?: string[] }
  | { ok: false; error: { id: string } };

const providerId = z.enum(ENRICHMENT_PROVIDER_IDS);
const entity = z.enum(["person", "organization"]);

// Configuring enrichment is an administrative act: the credential is company-wide and every user
// spends against it, so the gate is admin, not a per-record edit right.
async function guardAdmin() {
  const { actor } = await createContext();
  if (actor === null) return { ok: false as const, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (actor.type !== "admin") return { ok: false as const, error: { id: ERROR_IDS.PERM_DENIED } };
  return { ok: true as const };
}

async function guard(csrfToken: string | null) {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false as const, error: { id: "E_AUTH_CSRF" } };
  return guardAdmin();
}

export async function setProviderKeyAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z
    .object({ provider: providerId, apiKey: z.string().trim().min(8).max(512) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  await setProviderKey(db, parsed.data.provider, parsed.data.apiKey, SIG());
  return { ok: true };
}

export async function clearProviderKeyAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z.object({ provider: providerId }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  await clearProviderKey(db, parsed.data.provider, SIG());
  return { ok: true };
}

export async function setProviderEnabledAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z.object({ provider: providerId, enabled: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  const result = await setProviderEnabled(db, parsed.data.provider, parsed.data.enabled, SIG());
  return result.ok ? { ok: true } : { ok: false, error: { id: result.error.id } };
}

export async function setMappingAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z
    .object({
      entity,
      canonicalKey: z.string().min(1),
      target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("builtin"), key: z.string().min(1) }),
        z.object({ kind: z.literal("custom"), fieldDefId: z.string().uuid() }),
      ]),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  const result = await upsertMapping(
    db,
    parsed.data.entity,
    parsed.data.canonicalKey,
    parsed.data.target,
    SIG(),
  );
  return result.ok ? { ok: true } : { ok: false, error: { id: result.error.id } };
}

export async function clearMappingAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z.object({ entity, canonicalKey: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  await clearMapping(db, parsed.data.entity, parsed.data.canonicalKey, SIG());
  return { ok: true };
}

export async function setCacheTtlAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z.object({ days: z.number().int().min(0).max(MAX_TTL_DAYS) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  await setCacheTtlDays(db, parsed.data.days, SIG());
  return { ok: true };
}

// Verifies a stored key by making one real lookup against a well-known public domain. There is no
// free ping endpoint on any of the three, so this spends one credit; the settings copy says so.
// Only the outcome kind and the allowance counts are reported, never the provider's payload.
export async function testProviderAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<TestProviderActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = z.object({ provider: providerId }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  const result = await testProvider(db, parsed.data.provider, new Date(), SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  const { kind, quotaRemaining, notEntitled } = result.value;
  return {
    ok: true,
    kind,
    ...(quotaRemaining === undefined ? {} : { quotaRemaining }),
    ...(notEntitled === undefined ? {} : { notEntitled }),
  };
}
