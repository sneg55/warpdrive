import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { patchContactCustomField } from "@/features/contacts/contactCustomFieldPatch";
import { updateOrg } from "@/features/contacts/orgsRepo";
import {
  type ContactActor,
  type PersonEditAuthority,
  updatePerson,
} from "@/features/contacts/personsRepo";
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

export interface ApplySubject {
  entityId: string;
  outcomes: ProviderOutcome[];
}

const COMPANY_DOMAIN_KEY = "person.companyDomain";

export interface Outcome {
  appliedFields: string[];
  unresolved: string[];
  previous: Record<string, string | number | null>;
  written: AppliedValues;
  appended: string[];
}

export async function applyToPerson(
  tx: Db,
  actor: ContactActor,
  subject: ApplySubject,
  input: ApplyInput,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
  authority: PersonEditAuthority = "requires-contact-edit",
): Promise<Result<Outcome, AppError>> {
  const personId = subject.entityId;
  const person = await loadPerson(tx, personId, signal);
  if (person === null) return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", {}));

  const linkedOrg = await visibleOrgSummary(tx, actor, person.orgId, signal);
  const current = await readPersonCurrent(tx, person, mappings, signal, linkedOrg);
  const previous = current.canonicalValues;
  const planned = planPersonUpdate(input.selections, mappings, {
    emails: person.emails,
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
        domain: candidateDomain(subject.outcomes, planned.value.orgCandidateName),
      },
      signal,
      actor,
    );
    if (orgId === null) {
      drop(appliedFields, COMPANY_NAME_KEY);
      unresolved.push(COMPANY_NAME_KEY);
    } else if (orgId === person.orgId) {
      drop(appliedFields, COMPANY_NAME_KEY);
    } else patch.orgId = orgId;
  }

  if (appliedFields.length === 0)
    return ok({ appliedFields: [], unresolved, previous, written: {}, appended: [] });

  if (Object.keys(patch).length > 0) {
    patch.emails ??= planned.value.resolvedEmails;
    const held = [...person.emails.map((e) => e.value), person.primaryEmail ?? ""];
    const parsed = parsePersonPatch(personId, patch, held);
    if (!parsed.ok || parsed.value === undefined) {
      return err(
        new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "planned patch failed validation", {}),
      );
    }
    const result = await updatePerson(tx, actor, parsed.value, signal, authority);
    if (!result.ok) return result;
  }

  const custom = await writeCustomEntries(
    tx,
    actor,
    "person",
    personId,
    planned.value,
    signal,
    authority,
  );
  if (!custom.ok) return custom;
  return ok({
    appliedFields,
    unresolved,
    previous,
    written: planned.value.appliedValues,
    appended: planned.value.appendedFields,
  });
}

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

async function writeCustomEntries(
  tx: Db,
  actor: ContactActor,
  entity: "person" | "organization",
  id: string,
  planned: { customEntries: readonly CustomEntry[] },
  signal: AbortSignal,
  authority: PersonEditAuthority = "requires-contact-edit",
): Promise<Result<void, AppError>> {
  for (const entry of planned.customEntries) {
    const patched = await patchContactCustomField(
      tx,
      actor,
      { entity, id, key: entry.key, value: entry.value },
      signal,
      authority,
    );
    if (!patched.ok) return patched;
  }
  return ok(undefined);
}

export async function applyToOrg(
  tx: Db,
  actor: ContactActor,
  subject: ApplySubject,
  input: ApplyInput,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<Result<Outcome, AppError>> {
  const orgId = subject.entityId;
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
  return domains.size === 1 ? firstSpelling : undefined;
}
