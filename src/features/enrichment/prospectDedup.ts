import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { customFieldDefs, persons } from "@/db/schema";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { canSee } from "@/features/permissions/canSee";
import { PERSON_LINKEDIN_KEY } from "./canonicalKeys";
import { listMappings } from "./mappingsRepo";
import type { ProspectProfile } from "./providers/types";

export type ProspectMatch =
  | { kind: "new" }
  | { kind: "existing"; personId: string; personUpdatedAtIso: string };

export interface ProspectBadge {
  providerRef: string;
  match: ProspectMatch;
}

interface Candidate {
  id: string;
  updatedAtIso: string;
  normalisedName: string;
  linkedinUrl: string | null;
}

export function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function linkedinFieldKey(db: Db, signal: AbortSignal): Promise<string | null> {
  const mapping = (await listMappings(db, "person", signal)).find(
    (m) => m.canonicalKey === PERSON_LINKEDIN_KEY,
  );
  const fieldDefId = mapping?.targetFieldDefId ?? null;
  if (mapping === undefined || mapping.targetKind !== "custom" || fieldDefId === null) return null;
  const rows = await db
    .select({ key: customFieldDefs.key })
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.id, fieldDefId), isNull(customFieldDefs.archivedAt)));
  return rows[0]?.key ?? null;
}

function storedLinkedin(customFields: unknown, fieldKey: string | null): string | null {
  if (fieldKey === null || typeof customFields !== "object" || customFields === null) return null;
  const value = (customFields as Record<string, unknown>)[fieldKey];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function visibleCandidates(
  db: Db,
  actor: ContactActor,
  orgId: string,
  fieldKey: string | null,
  signal: AbortSignal,
): Promise<Candidate[]> {
  signal.throwIfAborted();
  const rows = await db
    .select()
    .from(persons)
    .where(and(eq(persons.orgId, orgId), isNull(persons.deletedAt)));
  return rows
    .filter((r) =>
      canSee(actor, {
        kind: "person",
        ownerId: r.ownerId,
        visibilityLevel: r.visibilityLevel,
        visibilityGroupId: r.visibilityGroupId,
        visibleToUserIds: r.visibleToUserIds,
      }),
    )
    .map((r) => ({
      id: r.id,
      updatedAtIso: r.updatedAt.toISOString(),
      normalisedName: normaliseName(r.name),
      linkedinUrl: storedLinkedin(r.customFields, fieldKey),
    }));
}

function resolve(matches: readonly Candidate[]): ProspectBadge["match"] {
  const only = matches.length === 1 ? matches[0] : undefined;
  if (only === undefined) return { kind: "new" };
  return { kind: "existing", personId: only.id, personUpdatedAtIso: only.updatedAtIso };
}

function matchProfile(profile: ProspectProfile, candidates: readonly Candidate[]): ProspectBadge {
  const linkedin = profile.linkedinUrl;
  if (linkedin !== undefined && linkedin.length > 0) {
    const byLinkedin = candidates.filter((c) => c.linkedinUrl === linkedin);
    if (byLinkedin.length > 0) {
      return { providerRef: profile.providerRef, match: resolve(byLinkedin) };
    }
  }
  const wanted = normaliseName(profile.fullName);
  const byName = wanted.length === 0 ? [] : candidates.filter((c) => c.normalisedName === wanted);
  return { providerRef: profile.providerRef, match: resolve(byName) };
}

export async function badgeProfiles(
  db: Db,
  actor: ContactActor,
  orgId: string,
  profiles: readonly ProspectProfile[],
  signal: AbortSignal,
): Promise<ProspectBadge[]> {
  signal.throwIfAborted();
  if (profiles.length === 0) return [];
  const fieldKey = await linkedinFieldKey(db, signal);
  const candidates = await visibleCandidates(db, actor, orgId, fieldKey, signal);
  return profiles.map((profile) => matchProfile(profile, candidates));
}
