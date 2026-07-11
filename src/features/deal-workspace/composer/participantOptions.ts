export interface ParticipantOption {
  id: string;
  name: string;
}

// Fallback label when the deal's person has no resolved name yet.
const DEAL_CONTACT_FALLBACK = "Deal contact";

// Build the participant candidate list for the activity composer.
//
// The deal's own contact person is ALWAYS a candidate (and appears first), even
// when the deal is linked to an organization. A person can be attached to a deal
// without being a formal member of the org record (person.orgId null), so relying
// on org membership alone (listPeopleForOrg) drops the deal's actual contact and
// surfaces unrelated org colleagues instead. Org people follow, de-duped by id so
// a contact who is also an org member is not listed twice.
export function buildParticipantOptions(
  orgPeople: ParticipantOption[],
  personId: string | null,
  personName: string | undefined,
): ParticipantOption[] {
  const dealPerson: ParticipantOption[] =
    personId !== null ? [{ id: personId, name: personName ?? DEAL_CONTACT_FALLBACK }] : [];

  const seen = new Set<string>();
  return [...dealPerson, ...orgPeople].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}
