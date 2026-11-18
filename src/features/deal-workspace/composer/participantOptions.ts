export interface ParticipantOption {
  id: string;
  name: string;
}

const DEAL_CONTACT_FALLBACK = "Deal contact";

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
