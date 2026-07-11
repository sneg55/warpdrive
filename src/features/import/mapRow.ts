import type { z } from "zod";
import { personCreateInput } from "@/features/contacts/schemas";
import { buildCustomFieldsSchema } from "@/features/custom-fields/validate";
import type { CustomFieldDef } from "@/types/customFields";
import type { MappedRow } from "@/types/import";
import { assertNever } from "@/types/result";
import { ADDRESS_PREFIX, primaryEntityOf } from "./importFields";
import {
  activityImportRowSchema,
  dealImportRowSchema,
  leadImportRowSchema,
  noteImportGroupSchema,
  orgImportGroupSchema,
  personImportGroupSchema,
} from "./importRowSchemas";
import { buildRowNoteBody } from "./rowNote";
import type { ResolvedColumnMapping } from "./schemas";
import type { ImportTarget } from "./wizardState";

// Defined in src/types so the Drizzle schema can type importRows.mapped without an import cycle.
export type { MappedRow };

// CSV gives a single email/phone cell; model it as one labeled primary contact point.
function coerceField(field: string, value: string): unknown {
  if (field === "emails" || field === "phones") {
    return [{ label: "work", value, primary: true }];
  }
  return value;
}

// "address.city" -> group.address.city. orgCreateInput.address is a structured object, so the
// dotted leaves the picker offers are reassembled here rather than handed over as raw cells.
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

// Where the cells of one row accumulate as the mapping is walked.
interface RowGroups {
  primary: Record<string, unknown>;
  customFields: Record<string, unknown>;
  related: Record<string, Record<string, unknown>>;
  noteBody: string | null;
}

// Route one mapped cell to the group its entity owns.
function routeCell(
  acc: RowGroups,
  col: ResolvedColumnMapping["columns"][string],
  cell: string,
  primaryEntity: string,
): void {
  if (col.isCustom) {
    // Only the target's own custom-field defs are offered, so a custom column is always primary.
    if (col.key !== "") acc.customFields[col.key] = cell;
    return;
  }
  if (col.field === "") return;
  if (col.entity === "note") {
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

// `headers` fixes the order of a row-note's unmapped lines. In the storage-backed flow `raw` comes
// from a JSONB column whose key order Postgres does not preserve, so the batch's stored headers are
// threaded through to keep the note in CSV column order.
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

  const out: MappedRow = { primary: acc.primary };
  if (acc.related.organization !== undefined) out.organization = acc.related.organization;
  if (acc.related.person !== undefined) out.person = acc.related.person;

  const body = buildRowNoteBody(raw, mapping, acc.noteBody, headers);
  if (body !== null) out.note = { body };
  return out;
}

type ValidateResult =
  | { ok: true; value: MappedRow }
  | { ok: false; errors: { field: string; message: string }[] };

function issuesOf(error: z.ZodError, prefix = ""): { field: string; message: string }[] {
  return error.issues.map((i) => ({
    field: `${prefix}${i.path.join(".")}`,
    message: i.message,
  }));
}

function primarySchema(target: ImportTarget, cfSchema: z.ZodTypeAny): z.ZodTypeAny {
  switch (target) {
    case "person":
      return personCreateInput.extend({ customFields: cfSchema });
    case "organization":
      // NOT orgCreateInput: it declares only name/address/customFields, so Zod would strip the
      // firmographics the picker now offers (domain, industry, employeeCount, ...) and the import
      // would silently drop every one. commit creates the org, then writes these via updateOrg.
      return orgImportGroupSchema.extend({ customFields: cfSchema });
    case "deal":
      return dealImportRowSchema.extend({ customFields: cfSchema });
    case "lead":
      return leadImportRowSchema;
    case "activity":
      return activityImportRowSchema.extend({ customFields: cfSchema });
    default:
      return assertNever(target);
  }
}

// Per-target CSV-boundary validation of every group the row produced. person/organization/deal/
// activity support custom fields (validated against the live defs); lead does not. Referential
// fields (deal pipeline/stage names, activity typeKey, an org's name) are only shape-checked
// here; resolving them to real ids happens later, at commit time.
export function validateMappedRow(
  target: ImportTarget,
  mapped: MappedRow,
  defs: CustomFieldDef[],
): ValidateResult {
  const cfSchema = buildCustomFieldsSchema(defs);
  const errors: { field: string; message: string }[] = [];
  const out: MappedRow = { primary: {} };

  const primary = primarySchema(target, cfSchema).safeParse(mapped.primary);
  if (primary.success) out.primary = primary.data as Record<string, unknown>;
  else errors.push(...issuesOf(primary.error));

  if (mapped.organization !== undefined) {
    const org = orgImportGroupSchema.safeParse(mapped.organization);
    if (org.success) out.organization = org.data;
    else errors.push(...issuesOf(org.error, "organization."));
  }
  if (mapped.person !== undefined) {
    const person = personImportGroupSchema.safeParse(mapped.person);
    if (person.success) out.person = person.data;
    else errors.push(...issuesOf(person.error, "person."));
  }
  if (mapped.note !== undefined) {
    const note = noteImportGroupSchema.safeParse(mapped.note);
    if (note.success) out.note = note.data;
    else errors.push(...issuesOf(note.error, "note."));
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}
