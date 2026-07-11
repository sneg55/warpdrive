// The shape a mapped CSV row takes between validate and commit. It lives in src/types (not the
// import feature) so the Drizzle schema can type importRows.mapped without importing the feature,
// which would close an import cycle.
//
// A CSV row describes more than one record: a BD shortlist row is a lead, its organization, and
// often a note. `primary` is the batch target's own record and is always present; the related
// groups appear only when the row actually carried cells for them.
export interface MappedRow {
  primary: Record<string, unknown>;
  organization?: Record<string, unknown>;
  person?: Record<string, unknown>;
  note?: { body: string };
}

// The pre-cross-entity shape: one flat object of the target's own fields, with a lead's
// organization carried as a bare "orgName" cell. Rows validated before that change still hold it,
// and they sit in "valid" state so nothing revalidates them.
export type LegacyMappedRow = Record<string, unknown>;

// Read a stored import_rows.mapped as a MappedRow, upgrading the legacy flat shape in place. A
// ready batch that was validated before this change must still commit to the same records rather
// than fail on deploy.
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
