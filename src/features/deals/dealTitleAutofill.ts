interface Option {
  id: string;
  name: string;
}

interface TitleSources {
  orgMode: "existing" | "new";
  orgId: string;
  newOrgName: string;
  personMode: "existing" | "new";
  personId: string;
  newPersonName: string;
}

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
