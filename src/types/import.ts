export interface MappedRow {
  primary: Record<string, unknown>;
  organization?: Record<string, unknown>;
  person?: Record<string, unknown>;
  note?: { body: string };
}

export type LegacyMappedRow = Record<string, unknown>;

export function upgradeMappedRow(stored: MappedRow | LegacyMappedRow | null): MappedRow {
  if (stored === null) return { primary: {} };
  if ("primary" in stored && typeof stored.primary === "object" && stored.primary !== null) {
    return stored as MappedRow;
  }
  const { orgName, ...rest } = stored as LegacyMappedRow;
  const upgraded: MappedRow = { primary: rest };
  if (typeof orgName === "string" && orgName.trim() !== "") {
    upgraded.organization = { name: orgName };
  }
  return upgraded;
}
