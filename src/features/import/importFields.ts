// The fields the import mapping step can target, keyed by the ENTITY that owns them rather than
// by the import's target. A CSV row routinely describes more than one record (a BD shortlist row
// is a lead AND its organization), and Pipedrive's picker is entity-tabbed for exactly that
// reason. mapRow groups the mapped cells back out by entity; commit writes each group through its
// own authority. Custom fields come from listDefs at render time.
import type { ImportTarget } from "./wizardState";

// Upper bound for a client-parsed CSV (25 MB, matching the attachment cap). The browser
// reads the whole file into memory and tokenizes it char by char, so an unbounded file
// (a 500 MB mis-selection) would freeze the tab; the upload step rejects anything larger.
export const MAX_IMPORT_CSV_BYTES = 26_214_400;

// "note" is not an import target; it is an extra record a row can produce alongside its primary.
export type MappableEntity = ImportTarget | "note";

export interface StandardImportField {
  field: string;
  label: string;
  required: boolean;
}

// Nested-object leaves are offered as dotted paths ("address.city"). orgCreateInput.address is a
// structured object that would reject a raw CSV cell, so mapRow reassembles the leaves instead of
// exposing a bare "address" field.
export const ADDRESS_PREFIX = "address.";

export const ENTITY_FIELDS: Record<MappableEntity, readonly StandardImportField[]> = {
  person: [
    { field: "name", label: "Name", required: true },
    { field: "emails", label: "Email", required: false },
    { field: "phones", label: "Phone", required: false },
  ],
  organization: [
    { field: "name", label: "Name", required: true },
    { field: "domain", label: "Website / domain", required: false },
    { field: "industry", label: "Industry", required: false },
    { field: "employeeCount", label: "Employee count", required: false },
    { field: "annualRevenue", label: "Annual revenue", required: false },
    { field: "linkedinUrl", label: "LinkedIn URL", required: false },
    { field: "address.street", label: "Address: street", required: false },
    { field: "address.city", label: "Address: city", required: false },
    { field: "address.region", label: "Address: state / region", required: false },
    { field: "address.postal", label: "Address: postal code", required: false },
    { field: "address.country", label: "Address: country", required: false },
  ],
  deal: [
    { field: "title", label: "Title", required: true },
    { field: "value", label: "Value", required: false },
    { field: "expectedCloseDate", label: "Expected close date", required: false },
    { field: "pipeline", label: "Pipeline", required: false },
    { field: "stage", label: "Stage", required: false },
  ],
  lead: [
    { field: "title", label: "Title", required: true },
    { field: "value", label: "Value", required: false },
    { field: "expectedCloseDate", label: "Expected close date", required: false },
    { field: "sourceChannel", label: "Source channel", required: false },
    { field: "sourceChannelId", label: "Source channel ID", required: false },
  ],
  activity: [
    { field: "subject", label: "Subject", required: true },
    { field: "typeKey", label: "Type", required: false },
    { field: "dueAt", label: "Due date", required: false },
    { field: "durationMinutes", label: "Duration (minutes)", required: false },
  ],
  note: [{ field: "body", label: "Note", required: false }],
};

export const ENTITY_LABELS: Record<MappableEntity, string> = {
  person: "Person",
  organization: "Organization",
  deal: "Deal",
  lead: "Lead",
  activity: "Activity",
  note: "Note",
};

// The entity a target's row primarily creates. Targets and entities share names, but the
// distinction matters: "note" is an entity that is never a target.
export function primaryEntityOf(target: ImportTarget): MappableEntity {
  return target;
}

// Which entities each target's row may write, primary first. A deal row can name its organization
// and its contact person.
//
// Activity has no note group: notes attach only to deal/person/organization/lead (ENTITY_TYPES),
// so offering "Note" on an activity import would produce a mapping that fails at commit.
export const TARGET_ENTITY_GROUPS: Record<ImportTarget, readonly MappableEntity[]> = {
  person: ["person", "organization", "note"],
  organization: ["organization", "note"],
  deal: ["deal", "organization", "person", "note"],
  lead: ["lead", "organization", "note"],
  activity: ["activity"],
};

// The primary entity's fields. Mapping-completeness and the per-target row schemas read this, so
// the required-field list has exactly one source of truth.
export const STANDARD_IMPORT_FIELDS: Record<ImportTarget, readonly StandardImportField[]> = {
  person: ENTITY_FIELDS.person,
  organization: ENTITY_FIELDS.organization,
  deal: ENTITY_FIELDS.deal,
  lead: ENTITY_FIELDS.lead,
  activity: ENTITY_FIELDS.activity,
};
