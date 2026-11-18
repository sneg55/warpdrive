import type { MappedRow } from "@/types/import";
import { ADDRESS_PREFIX, PERSON_NAME_PARTS, primaryEntityOf } from "./importFields";
import { buildRowNoteBody } from "./rowNote";
import type { ResolvedColumnMapping } from "./schemas";
import type { ImportTarget } from "./wizardState";

export { validateMappedRow } from "./validateMappedRow";
export type { MappedRow };

function coerceField(field: string, value: string): unknown {
  if (field === "emails" || field === "phones") {
    return [{ label: "work", value, primary: true }];
  }
  return value;
}

function setNested(group: Record<string, unknown>, field: string, value: unknown): void {
  if (!field.startsWith(ADDRESS_PREFIX)) {
    group[field] = value;
    return;
  }
  const leaf = field.slice(ADDRESS_PREFIX.length);
  const address = (group.address ?? {}) as Record<string, unknown>;
  address[leaf] = value;
  group.address = address;
}

function deriveDisplayName(group: Record<string, unknown> | undefined): void {
  if (group === undefined || typeof group.name === "string") return;
  const parts: string[] = [];
  for (const part of PERSON_NAME_PARTS) {
    const value = group[part];
    if (typeof value === "string" && value.trim() !== "") parts.push(value.trim());
  }
  if (parts.length > 0) group.name = parts.join(" ");
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function mergeDueTime(primary: Record<string, unknown>): void {
  const { dueAt, dueTime } = primary;
  if (typeof dueAt !== "string" || typeof dueTime !== "string") return;
  if (DATE_ONLY.test(dueAt.trim())) primary.dueAt = `${dueAt.trim()} ${dueTime.trim()}`;
  delete primary.dueTime;
}

interface RowGroups {
  primary: Record<string, unknown>;
  customFields: Record<string, unknown>;
  related: Record<string, Record<string, unknown>>;
  noteBody: string | null;
}

function routeCell(
  acc: RowGroups,
  col: ResolvedColumnMapping["columns"][string],
  cell: string,
  primaryEntity: string,
): void {
  if (col.isCustom) {
    if (col.key !== "") acc.customFields[col.key] = cell;
    return;
  }
  if (col.field === "") return;
  if (col.entity === "note" && primaryEntity !== "note") {
    if (col.field === "body") acc.noteBody = cell;
    return;
  }
  if (col.entity === primaryEntity) {
    setNested(acc.primary, col.field, coerceField(col.field, cell));
    return;
  }
  const group = acc.related[col.entity] ?? {};
  setNested(group, col.field, coerceField(col.field, cell));
  acc.related[col.entity] = group;
}

export function applyMapping(
  raw: Record<string, string>,
  mapping: ResolvedColumnMapping,
  target: ImportTarget,
  headers?: readonly string[],
): MappedRow {
  const primaryEntity = primaryEntityOf(target);
  const acc: RowGroups = { primary: {}, customFields: {}, related: {}, noteBody: null };

  for (const [header, col] of Object.entries(mapping.columns)) {
    const cell = raw[header];
    if (cell === undefined || cell === "") continue;
    routeCell(acc, col, cell, primaryEntity);
  }

  acc.primary.customFields = acc.customFields;
  if (primaryEntity === "person") deriveDisplayName(acc.primary);
  if (primaryEntity === "activity") mergeDueTime(acc.primary);
  deriveDisplayName(acc.related.person);

  const out: MappedRow = { primary: acc.primary };
  if (acc.related.organization !== undefined) out.organization = acc.related.organization;
  if (acc.related.person !== undefined) out.person = acc.related.person;

  if (primaryEntity === "note") return out;
  const body = buildRowNoteBody(raw, mapping, acc.noteBody, headers);
  if (body !== null) out.note = { body };
  return out;
}
