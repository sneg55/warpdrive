import type { Db } from "@/db/client";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { type CurrentValues, loadPerson, readPersonCurrent } from "./current";
import { mergeCandidates } from "./merge";
import { visibleOrgSummary } from "./orgLink";
import { badgeProfiles, type ProspectMatch } from "./prospectDedup";
import type { ProspectProfile, ProviderOutcome } from "./providers/types";
import type { ProposedField, ResolvedMapping } from "./types";

export interface ProspectMergeBase {
  match: ProspectMatch;
  current: CurrentValues;
}

export function emptyBase(): ProspectMergeBase {
  return {
    match: { kind: "new" },
    current: {
      canonicalValues: {},
      multiValues: {},
      occupiedKeys: [],
      customFieldKeyById: new Map<string, string>(),
    },
  };
}

async function currentForPerson(
  db: Db,
  actor: ContactActor,
  personId: string,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<CurrentValues> {
  const person = await loadPerson(db, personId, signal);
  if (person === null) return emptyBase().current;
  const linkedOrg = await visibleOrgSummary(db, actor, person.orgId, signal);
  return await readPersonCurrent(db, person, mappings, signal, linkedOrg);
}

export async function prospectMergeBases(
  db: Db,
  actor: ContactActor,
  orgId: string,
  profiles: readonly ProspectProfile[],
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<Map<string, ProspectMergeBase>> {
  const badges = await badgeProfiles(db, actor, orgId, profiles, signal);
  const byPerson = new Map<string, CurrentValues>();
  const bases = new Map<string, ProspectMergeBase>();

  for (const badge of badges) {
    if (badge.match.kind === "new") {
      bases.set(badge.providerRef, emptyBase());
      continue;
    }
    const personId = badge.match.personId;
    const cached = byPerson.get(personId);
    const current = cached ?? (await currentForPerson(db, actor, personId, mappings, signal));
    byPerson.set(personId, current);
    bases.set(badge.providerRef, { match: badge.match, current });
  }
  return bases;
}

export function proposeFields(
  base: ProspectMergeBase,
  outcomes: readonly ProviderOutcome[],
  mappings: readonly ResolvedMapping[],
): ProposedField[] {
  return mergeCandidates(
    outcomes,
    base.current.canonicalValues,
    mappings,
    base.current.multiValues,
    base.current.occupiedKeys,
  );
}
