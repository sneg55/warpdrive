// Pure planning: selections plus mappings become an update patch for the existing contact repos.
// Nothing here touches the database. The write itself goes through updatePerson / updateOrg so
// enrichment inherits their visibility check, contact.edit gate, and custom-field validation
// rather than growing a second, subtly different write path.
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { OrgUpdateInput, PersonUpdateInput } from "@/features/contacts/schemas";
import { err, ok, type Result } from "@/types/result";
import { isCanonicalKey, valueTypeOf } from "./canonical";
import { isUsableProposedValue } from "./fieldValidity";
import {
  applyBuiltinSelection,
  type PersonAccumulator,
  type PlanContactPoint,
  withStandalonePrimary,
} from "./personEmailPlan";
import type { ResolvedMapping, Selection } from "./types";

const ADDRESS_PREFIX = "address.";
const MONEY_DECIMALS = 2;

type AddressObject = Record<string, string>;

// The value each applied field was coerced to before the write, keyed by canonical key. Money is
// rounded and numbers are parsed, so the raw selection is not what the record ends up holding.
export type AppliedValues = Record<string, string | number>;

export interface OrgPlan {
  patch: Omit<OrgUpdateInput, "id">;
  appliedFields: string[];
  appliedValues: AppliedValues;
  // Custom fields never travel inside the patch. updateOrg validates the whole customFields object
  // against the ACTIVE definitions and strips everything else, so a snapshot would delete the
  // values of archived fields. These are written one key at a time with a JSONB merge instead.
  customEntries: CustomEntry[];
}

export interface PersonPlan {
  patch: Omit<PersonUpdateInput, "id">;
  appliedFields: string[];
  // See OrgPlan.appliedValues. person.companyName resolves to an organization link rather than a
  // scalar, so it has no entry here.
  appliedValues: AppliedValues;
  // See OrgPlan.customEntries: a whole-object write would strip archived keys.
  customEntries: CustomEntry[];
  // The person's emails with a primary held only in the column folded back in. updatePerson
  // re-derives primary_email from the array it is given, and from the row's array when the patch
  // carries none, so any person write that omits this drops such a primary.
  resolvedEmails: PlanContactPoint[];
  // Keys written into a set rather than over a value. Nothing was replaced, so the change log must
  // not name a previous value for them.
  appendedFields: string[];
  // The caller resolves a company name against real organizations. Writing an org id from a
  // provider string without checking would silently invent a link to the wrong company.
  orgCandidateName?: string;
}

export interface OrgCurrent {
  address: Record<string, unknown> | null;
  customFieldKeyById: ReadonlyMap<string, string>;
}

export interface PersonCurrent {
  emails: PlanContactPoint[];
  // persons.primary_email is a column of its own and need not appear in the emails array.
  // Omitting it is safe only for a person whose array already carries it.
  primaryEmail?: string | null;
  customFieldKeyById: ReadonlyMap<string, string>;
}

function resolve(
  selection: Selection,
  mappings: readonly ResolvedMapping[],
): Result<ResolvedMapping, AppError> {
  if (!isCanonicalKey(selection.canonicalKey)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "unknown canonical key", {
        canonicalKey: selection.canonicalKey,
      }),
    );
  }
  const mapping = mappings.find((m) => m.canonicalKey === selection.canonicalKey);
  if (mapping === undefined) {
    return err(
      new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "canonical key is not mapped", {
        canonicalKey: selection.canonicalKey,
      }),
    );
  }
  // applyEnrichment backs a selection against the run's raw outcomes, not against the preview the
  // merge built, so a direct action request can name a value the dialog filtered out. A custom
  // target reaches the write through custom-field validation, which has no notion of an address,
  // making this the last place the field's own rule can be applied.
  if (!isUsableProposedValue(selection.canonicalKey, selection.value)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "value breaks the field's rule", {
        canonicalKey: selection.canonicalKey,
      }),
    );
  }
  return ok(mapping);
}

export interface CustomEntry {
  key: string;
  value: string | number;
}

function customEntry(
  mapping: ResolvedMapping,
  value: string | number,
  byId: ReadonlyMap<string, string>,
): Result<CustomEntry, AppError> {
  const key = mapping.targetFieldDefId === null ? undefined : byId.get(mapping.targetFieldDefId);
  if (key === undefined) {
    return err(
      new AppError(ERROR_IDS.ENRICH_MAPPING_INVALID, "target custom field no longer exists", {
        canonicalKey: mapping.canonicalKey,
      }),
    );
  }
  const scalar = customScalar(mapping.canonicalKey, value);
  if (!scalar.ok) return scalar;
  return ok({ key, value: scalar.value });
}

function numeric(value: string | number): number {
  return typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
}

// Two organization built-ins are not plain text: employee_count is an integer column and
// annual_revenue is numeric(14,2) that the schema accepts as a decimal string.
function orgScalar(
  target: string,
  canonicalKey: string,
  value: string | number,
): Result<string | number, AppError> {
  if (target === "employeeCount") {
    const parsed = numeric(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return err(
        new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "value is not a whole number", {
          canonicalKey,
        }),
      );
    }
    return ok(parsed);
  }
  if (target === "annualRevenue") {
    const parsed = numeric(value);
    if (!Number.isFinite(parsed)) {
      return err(
        new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "value is not a number", { canonicalKey }),
      );
    }
    return ok(parsed.toFixed(MONEY_DECIMALS));
  }
  return ok(String(value));
}

// A custom target holds either a plain string or a plain number (mappingsRepo decides which from
// the canonical key), so write that shape rather than whatever the provider happened to emit.
// Rounding keeps a monetary field's two-decimal rule satisfied; numeric accepts it either way.
function customScalar(
  canonicalKey: string,
  value: string | number,
): Result<string | number, AppError> {
  if (valueTypeOf(canonicalKey) !== "number") return ok(String(value));
  const parsed = numeric(value);
  if (!Number.isFinite(parsed)) {
    return err(
      new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "value is not a number", { canonicalKey }),
    );
  }
  return ok(Number(parsed.toFixed(MONEY_DECIMALS)));
}

export function planOrgUpdate(
  selections: readonly Selection[],
  mappings: readonly ResolvedMapping[],
  current: OrgCurrent,
): Result<OrgPlan, AppError> {
  const patch: Record<string, unknown> = {};
  const customEntries: CustomEntry[] = [];
  const address: AddressObject = { ...(current.address as AddressObject | null) };
  const appliedFields: string[] = [];
  const appliedValues: AppliedValues = {};
  let addressTouched = false;

  for (const selection of selections) {
    const resolved = resolve(selection, mappings);
    if (!resolved.ok) return resolved;
    const mapping = resolved.value;

    if (mapping.targetKind === "custom") {
      const entry = customEntry(mapping, selection.value, current.customFieldKeyById);
      if (!entry.ok) return entry;
      customEntries.push(entry.value);
      appliedFields.push(mapping.canonicalKey);
      appliedValues[mapping.canonicalKey] = entry.value.value;
      continue;
    }

    const target = mapping.targetKey ?? "";
    if (target.startsWith(ADDRESS_PREFIX)) {
      const leaf = String(selection.value);
      address[target.slice(ADDRESS_PREFIX.length)] = leaf;
      addressTouched = true;
      appliedFields.push(mapping.canonicalKey);
      appliedValues[mapping.canonicalKey] = leaf;
      continue;
    }

    const scalar = orgScalar(target, mapping.canonicalKey, selection.value);
    if (!scalar.ok) return scalar;
    patch[target] = scalar.value;
    appliedFields.push(mapping.canonicalKey);
    appliedValues[mapping.canonicalKey] = scalar.value;
  }

  if (addressTouched) patch.address = address;
  return ok({ patch, appliedFields, appliedValues, customEntries });
}

export function planPersonUpdate(
  selections: readonly Selection[],
  mappings: readonly ResolvedMapping[],
  current: PersonCurrent,
): Result<PersonPlan, AppError> {
  const customEntries: CustomEntry[] = [];
  const acc: PersonAccumulator = {
    patch: {},
    emails: withStandalonePrimary(current.emails, current.primaryEmail),
    appliedFields: [],
    appliedValues: {},
    appendedFields: [],
    emailsTouched: false,
  };

  for (const selection of selections) {
    const resolved = resolve(selection, mappings);
    if (!resolved.ok) return resolved;
    const mapping = resolved.value;

    if (mapping.targetKind === "custom") {
      const entry = customEntry(mapping, selection.value, current.customFieldKeyById);
      if (!entry.ok) return entry;
      customEntries.push(entry.value);
      acc.appliedFields.push(mapping.canonicalKey);
      acc.appliedValues[mapping.canonicalKey] = entry.value.value;
      continue;
    }

    applyBuiltinSelection(acc, mapping, selection);
  }

  const { patch, appliedFields, appliedValues, appendedFields, emails, orgCandidateName } = acc;
  if (acc.emailsTouched) patch.emails = emails;
  return ok({
    patch,
    appliedFields,
    appliedValues,
    customEntries,
    orgCandidateName,
    resolvedEmails: emails,
    appendedFields,
  });
}

// Exported so the settings page can explain which canonical keys can only carry numbers.
export function isNumericCanonicalKey(canonicalKey: string): boolean {
  return valueTypeOf(canonicalKey) === "number";
}
