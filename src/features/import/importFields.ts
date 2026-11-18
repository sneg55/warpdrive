import type { ImportSource } from "@/constants/importSources";
import {
  PIPEDRIVE_ACTIVITY_FIELDS,
  PIPEDRIVE_DEAL_FIELDS,
  PIPEDRIVE_LEAD_FIELDS,
  PIPEDRIVE_NOTE_FIELDS,
  PIPEDRIVE_ORGANIZATION_FIELDS,
  PIPEDRIVE_PERSON_FIELDS,
} from "./pipedriveImportFields";
import type { ImportTarget } from "./wizardState";

export const MAX_IMPORT_CSV_BYTES = 26_214_400;

export type MappableEntity = ImportTarget | "note";

export interface StandardImportField {
  field: string;
  label: string;
  required: boolean;
  satisfiedBy?: readonly string[];
  sources?: readonly ImportSource[];
}

export const PERSON_NAME_PARTS = ["firstName", "lastName"] as const;

export const ADDRESS_PREFIX = "address.";

const CSV_ONLY = ["csv"] as const;

export const ENTITY_FIELDS: Record<MappableEntity, readonly StandardImportField[]> = {
  person: [
    { field: "name", label: "Name", required: true, satisfiedBy: PERSON_NAME_PARTS },
    { field: "firstName", label: "First name", required: false },
    { field: "lastName", label: "Last name", required: false },
    { field: "emails", label: "Email", required: false },
    { field: "phones", label: "Phone", required: false },
    ...PIPEDRIVE_PERSON_FIELDS,
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
    ...PIPEDRIVE_ORGANIZATION_FIELDS,
  ],
  deal: [
    { field: "title", label: "Title", required: true },
    { field: "value", label: "Value", required: false },
    { field: "expectedCloseDate", label: "Expected close date", required: false },
    { field: "pipeline", label: "Pipeline", required: false },
    { field: "stage", label: "Stage", required: false },
    ...PIPEDRIVE_DEAL_FIELDS,
  ],
  lead: [
    { field: "title", label: "Title", required: true },
    { field: "value", label: "Value", required: false },
    { field: "expectedCloseDate", label: "Expected close date", required: false },
    { field: "sourceChannel", label: "Source channel", required: false, sources: CSV_ONLY },
    { field: "sourceChannelId", label: "Source channel ID", required: false, sources: CSV_ONLY },
    ...PIPEDRIVE_LEAD_FIELDS,
  ],
  activity: [
    { field: "subject", label: "Subject", required: true },
    { field: "typeKey", label: "Type", required: false },
    { field: "dueAt", label: "Due date", required: false },
    { field: "durationMinutes", label: "Duration (minutes)", required: false },
    ...PIPEDRIVE_ACTIVITY_FIELDS,
  ],
  note: [{ field: "body", label: "Note", required: false }, ...PIPEDRIVE_NOTE_FIELDS],
};

export const ENTITY_LABELS: Record<MappableEntity, string> = {
  person: "Person",
  organization: "Organization",
  deal: "Deal",
  lead: "Lead",
  activity: "Activity",
  note: "Note",
};

export function qualifiedFieldLabel(entity: MappableEntity, fieldLabel: string): string {
  const entityLabel = ENTITY_LABELS[entity];
  if (fieldLabel === entityLabel) return entityLabel;
  return `${entityLabel}[${fieldLabel}]`;
}

export function primaryEntityOf(target: ImportTarget): MappableEntity {
  return target;
}

export const TARGET_ENTITY_GROUPS: Record<ImportTarget, readonly MappableEntity[]> = {
  person: ["person", "organization", "note"],
  organization: ["organization", "note"],
  deal: ["deal", "organization", "person", "note"],
  lead: ["lead", "organization", "person", "note"],
  activity: ["activity"],
  note: ["note"],
};

export const STANDARD_IMPORT_FIELDS: Record<ImportTarget, readonly StandardImportField[]> = {
  person: ENTITY_FIELDS.person,
  organization: ENTITY_FIELDS.organization,
  deal: ENTITY_FIELDS.deal,
  lead: ENTITY_FIELDS.lead,
  activity: ENTITY_FIELDS.activity,
  note: ENTITY_FIELDS.note.map((f) => (f.field === "body" ? { ...f, required: true } : f)),
};

export const IMPORT_TARGETS = [
  "person",
  "organization",
  "deal",
  "lead",
  "activity",
  "note",
] as const satisfies readonly ImportTarget[];

export const PIPEDRIVE_ID_FIELD = "pipedriveId";

const PIPEDRIVE_ID_REQUIRED_TARGETS: readonly ImportTarget[] = [
  "person",
  "organization",
  "deal",
  "lead",
  "activity",
  "note",
];

const SOURCE_TARGETS: Record<ImportSource, readonly ImportTarget[]> = {
  csv: ["person", "organization", "deal", "lead", "activity"],
  pipedrive: ["person", "organization", "deal", "lead", "activity", "note"],
};

export function isFieldOfferedFor(field: StandardImportField, source: ImportSource): boolean {
  return field.sources === undefined || field.sources.includes(source);
}

export const SIDE_NOTE_FIELD = "body";

export function isFieldOfferedInGroup(
  entity: MappableEntity,
  target: ImportTarget,
  field: StandardImportField,
): boolean {
  return entity !== "note" || target === "note" || field.field === SIDE_NOTE_FIELD;
}

export function fieldsFor(entity: MappableEntity, source: ImportSource): StandardImportField[] {
  return ENTITY_FIELDS[entity].filter((f) => isFieldOfferedFor(f, source));
}

export function targetsFor(source: ImportSource): readonly ImportTarget[] {
  return SOURCE_TARGETS[source];
}

export function requiredFieldsFor(
  target: ImportTarget,
  source: ImportSource,
): StandardImportField[] {
  const required = STANDARD_IMPORT_FIELDS[target].filter((f) => f.required);
  if (source !== "pipedrive" || !PIPEDRIVE_ID_REQUIRED_TARGETS.includes(target)) return required;
  const idField = ENTITY_FIELDS[target].find((f) => f.field === PIPEDRIVE_ID_FIELD);
  return idField === undefined ? required : [...required, idField];
}
