// The per-entity write halves of an apply: plan the patch, resolve an organization link, then go
// through updatePerson / updateOrg so enrichment inherits their validation rather than growing a
// second write path.
import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import type { EnrichmentRunRow } from "@/db/schema/enrichment";
import { patchContactCustomField } from "@/features/contacts/contactCustomFieldPatch";
import { updateOrg } from "@/features/contacts/orgsRepo";
import { type ContactActor, updatePerson } from "@/features/contacts/personsRepo";
import { orgUpdateInput } from "@/features/contacts/schemas";
import { err, ok, type Result } from "@/types/result";
import type { ApplyInput } from "./applyService";
import { COMPANY_NAME_KEY } from "./canonicalKeys";
import { loadOrg, loadPerson, readOrgCurrent, readPersonCurrent } from "./current";
import { normaliseForCompare } from "./merge";
import { normaliseDomain, resolveOrgLink, visibleOrgSummary } from "./orgLink";
import { parsePersonPatch } from "./personPatchGuard";
import { type AppliedValues, type CustomEntry, planOrgUpdate, planPersonUpdate } from "./plan";
import type { ProviderOutcome } from "./providers/types";
import type { ResolvedMapping } from "./types";

const COMPANY_DOMAIN_KEY = "person.companyDomain";

export // What an apply helper reports. `previous` holds the pre-write values keyed by canonical key so the
// change log can name what an overwrite replaced. The post-write version is read once by the
// caller, after the helper has run, rather than by every helper.
interface Outcome {
  appliedFields: string[];
  unresolved: string[];
  previous: Record<string, string | number | null>;
  // What each field was coerced to before the write, so the change log names the stored value
  // rather than the provider's raw one. A company name links an organization and has no entry.
  written: AppliedValues;
  // Keys added to a set rather than written over a value. Nothing was replaced for these.
  appended: string[];
}

export async function applyToPerson(
  tx: Db,
  actor: ContactActor,
  run: EnrichmentRunRow,
  input: ApplyInput,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<Result<Outcome, AppError>> {
  const personId = run.entityId;
  const person = await loadPerson(tx, personId, signal);
  if (person === null) return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));

  // The linked organization as this actor may see it, so the change log records the company name
  // an overwrite replaced rather than a placeholder, and a hidden link reads as no link.
  const linkedOrg = await visibleOrgSummary(tx, actor, person.orgId, signal);
  const current = await readPersonCurrent(tx, person, mappings, signal, linkedOrg);
  const previous = current.canonicalValues;
  const planned = planPersonUpdate(input.selections, mappings, {
    emails: person.emails,
    // primary_email is a column of its own and is not always mirrored in the array. Without it the
    // planner rebuilds emails without the existing primary, and updatePerson re-derives from that.
    primaryEmail: person.primaryEmail,
    customFieldKeyById: current.customFieldKeyById,
  });
  if (!planned.ok) return planned;

  const patch: Record<string, unknown> = { ...planned.value.patch };
  const appliedFields = [...planned.value.appliedFields];
  const unresolved: string[] = [];

  if (planned.value.orgCandidateName !== undefined) {
    const orgId = await resolveOrgLink(
      tx,
      {
        name: planned.value.orgCandidateName,
        domain: candidateDomain(run.outcomes, planned.value.orgCandidateName),
      },
      signal,
      actor,
    );
    // Only an unambiguous match links. Creating an organization has its own visibility and
    // ownership decisions, and guessing them from a provider string breeds duplicates.
    if (orgId === null) {
      drop(appliedFields, COMPANY_NAME_KEY);
      unresolved.push(COMPANY_NAME_KEY);
    } else if (orgId === person.orgId) {
      // A different spelling of the company already linked. Writing it would move updatedAt and
      // add a change-log row for a link the user cannot see change.
      drop(appliedFields, COMPANY_NAME_KEY);
    } else patch.orgId = orgId;
  }

  if (appliedFields.length === 0)
    return ok({ appliedFields: [], unresolved, previous, written: {}, appended: [] });

  if (Object.keys(patch).length > 0) {
    // Any write reaching updatePerson has to carry the emails array, or the re-derived
    // primary_email drops a primary the record held only in its column.
    patch.emails ??= planned.value.resolvedEmails;
    // The repos take their input as already parsed. Without this, a caller could post an invalid
    // email or an overlong string through the enrichment action and reach the same tables by a
    // route that skips every rule the ordinary edit form enforces. Addresses the record already
    // holds are exempt from the address rule: they are not what this write is introducing.
    // primary_email counts as held even when the array does not carry it: the planner folds it
    // back in, so it reaches the patch and would otherwise be judged as newly introduced.
    const held = [...person.emails.map((e) => e.value), person.primaryEmail ?? ""];
    const parsed = parsePersonPatch(personId, patch, held);
    if (!parsed.ok || parsed.value === undefined) {
      return err(
        new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "planned patch failed validation", {}),
      );
    }
    const result = await updatePerson(tx, actor, parsed.value, signal);
    if (!result.ok) return result;
  }

  const custom = await writeCustomEntries(tx, actor, "person", personId, planned.value, signal);
  if (!custom.ok) return custom;
  return ok({
    appliedFields,
    unresolved,
    previous,
    written: planned.value.appliedValues,
    appended: planned.value.appendedFields,
  });
}

// organizations.address is free-form jsonb, but the org update schema is a plain z.object and
// strips every key it does not name (the demo seed writes `locality`). updateOrg replaces the whole
// column, so writing one leaf would delete the rest. Whatever the schema dropped goes back on top.
async function restoreAddressKeys(
  tx: Db,
  orgId: string,
  before: Record<string, unknown> | null,
  validated: Record<string, unknown> | null | undefined,
  written: Record<string, unknown> | null,
): Promise<void> {
  if (before === null) return;
  const kept = new Set(Object.keys(validated ?? {}));
  const dropped = Object.entries(before).filter(([key]) => !kept.has(key));
  if (dropped.length === 0) return;
  await tx
    .update(organizations)
    .set({ address: { ...Object.fromEntries(dropped), ...(written ?? {}) } })
    .where(eq(organizations.id, orgId));
}

// One key at a time, through the same JSONB merge the inline editor uses. A whole-object write
// would run the record's customFields past the active-definition schema, which strips the values
// of archived fields the selection never named.
async function writeCustomEntries(
  tx: Db,
  actor: ContactActor,
  entity: "person" | "organization",
  id: string,
  planned: { customEntries: readonly CustomEntry[] },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  for (const entry of planned.customEntries) {
    const patched = await patchContactCustomField(
      tx,
      actor,
      { entity, id, key: entry.key, value: entry.value },
      signal,
    );
    if (!patched.ok) return patched;
  }
  return ok(undefined);
}

export async function applyToOrg(
  tx: Db,
  actor: ContactActor,
  run: EnrichmentRunRow,
  input: ApplyInput,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<Result<Outcome, AppError>> {
  const orgId = run.entityId;
  const org = await loadOrg(tx, orgId, signal);
  if (org === null) return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));

  const current = await readOrgCurrent(tx, org, mappings, signal);
  const previous = current.canonicalValues;
  const planned = planOrgUpdate(input.selections, mappings, {
    address: org.address,
    customFieldKeyById: current.customFieldKeyById,
  });
  if (!planned.ok) return planned;
  if (planned.value.appliedFields.length === 0) {
    return ok({ appliedFields: [], unresolved: [], previous, written: {}, appended: [] });
  }

  if (Object.keys(planned.value.patch).length === 0) {
    const only = await writeCustomEntries(tx, actor, "organization", orgId, planned.value, signal);
    if (!only.ok) return only;
    return ok({
      appliedFields: planned.value.appliedFields,
      unresolved: [],
      previous,
      written: planned.value.appliedValues,
      appended: [],
    });
  }

  const parsed = orgUpdateInput.safeParse({ id: orgId, ...planned.value.patch });
  if (!parsed.success) {
    return err(new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "planned patch failed validation", {}));
  }

  const result = await updateOrg(tx, actor, parsed.data, signal);
  if (!result.ok) return result;
  await restoreAddressKeys(tx, orgId, org.address, parsed.data.address, result.value.address);
  const custom = await writeCustomEntries(tx, actor, "organization", orgId, planned.value, signal);
  if (!custom.ok) return custom;
  return ok({
    appliedFields: planned.value.appliedFields,
    unresolved: [],
    previous,
    written: planned.value.appliedValues,
    appended: [],
  });
}

function drop(fields: string[], key: string): void {
  const index = fields.indexOf(key);
  if (index !== -1) fields.splice(index, 1);
}

// The company domain usually has no target of its own, so the run is the only place it exists.
// It must come from an outcome that reported the company the user actually chose: when providers
// disagree on the name, a domain lifted from any outcome links the person to the other company,
// and the domain wins the match, so the wrong link happens silently.
function candidateDomain(
  outcomes: readonly ProviderOutcome[],
  selectedName: string,
): string | undefined {
  const wanted = normaliseForCompare(COMPANY_NAME_KEY, selectedName);
  const domains = new Set<string>();
  let firstSpelling: string | undefined;
  for (const outcome of outcomes) {
    const name = outcome.candidate?.fields[COMPANY_NAME_KEY];
    if (name === undefined) continue;
    if (normaliseForCompare(COMPANY_NAME_KEY, name) !== wanted) continue;
    const reported = outcome.candidate?.fields[COMPANY_DOMAIN_KEY];
    if (typeof reported !== "string" || reported.trim().length === 0) continue;
    domains.add(normaliseDomain(reported));
    firstSpelling ??= reported;
  }
  // Only an agreed domain is usable. Providers naming the same company but disagreeing on its
  // domain would otherwise have the first one win, and since domain outranks name in matching, that
  // silently picks an organization the user never chose. Disagreement falls back to the name.
  return domains.size === 1 ? firstSpelling : undefined;
}
