interface Option {
  id: string;
  name: string;
}

// The subset of Add-deal state needed to derive a default title.
interface TitleSources {
  orgMode: "existing" | "new";
  orgId: string;
  newOrgName: string;
  personMode: "existing" | "new";
  personId: string;
  newPersonName: string;
}

// Default deal/lead title derived from whatever contact we have: "{name} {noun}". The organization
// leads (matches PD's org-first identity); the person is the fallback. Empty when neither is set,
// so the modal only autofills once a contact is chosen. Callers stop applying this once the user
// edits the title themselves. `noun` is "deal" for the Add deal modal, "lead" for Add lead.
// `appendNoun` gates PD's "Automatically add 'lead' and 'deal' to lead/deal titles" preference:
// when false the title is just the contact name, with no noun appended.
export function deriveEntityTitle(
  s: TitleSources,
  orgs: Option[],
  people: Option[],
  noun = "deal",
  appendNoun = true,
): string {
  const orgName =
    s.orgMode === "new" ? s.newOrgName.trim() : (orgs.find((o) => o.id === s.orgId)?.name ?? "");
  const personName =
    s.personMode === "new"
      ? s.newPersonName.trim()
      : (people.find((p) => p.id === s.personId)?.name ?? "");
  const base = orgName !== "" ? orgName : personName;
  if (base === "") return "";
  return appendNoun ? `${base} ${noun}` : base;
}
