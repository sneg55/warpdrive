import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { changeLogs } from "@/db/schema";
import type { ProspectRevealRow } from "@/db/schema/prospects";
import { type ContactActor, createPerson } from "@/features/contacts/personsRepo";
import { can } from "@/features/permissions/can";
import { lockAndAuthorize, validateSelections } from "./applyGuards";
import type { Outcome } from "./applyWrites";
import type { ProspectMatch } from "./prospectDedup";
import { isBackedByRun, providersBehind } from "./provenance";
import type { Selection } from "./types";

export interface ProspectApplyItem {
  providerRef: string;
  selections: Selection[];
  existing: { personId: string; expectedUpdatedAtIso: string } | null;
}

export async function resolvePerson(
  tx: Db,
  actor: ContactActor,
  orgId: string,
  item: ProspectApplyItem,
  row: ProspectRevealRow,
  match: ProspectMatch,
  signal: AbortSignal,
): Promise<string> {
  if (item.existing === null) return await createFromProfile(tx, actor, orgId, row, signal);

  if (match.kind !== "existing" || match.personId !== item.existing.personId) {
    throw new AppError(
      ERROR_IDS.ENRICH_PROSPECT_MISMATCH,
      "existing selection does not match the reveal's profile",
      { personId: item.existing.personId },
    );
  }

  const authorized = await lockAndAuthorize(tx, actor, "person", item.existing.personId, signal);
  if (!authorized.ok) throw authorized.error;
  if (authorized.value.toISOString() !== item.existing.expectedUpdatedAtIso) {
    throw new AppError(ERROR_IDS.ENRICH_STALE, "person changed since the reveal", {
      personId: item.existing.personId,
    });
  }
  return item.existing.personId;
}

async function createFromProfile(
  tx: Db,
  actor: ContactActor,
  orgId: string,
  row: ProspectRevealRow,
  signal: AbortSignal,
): Promise<string> {
  if (!can(actor, "contact.create")) {
    throw new AppError(ERROR_IDS.PERM_DENIED, "contact.create required", { orgId });
  }
  const created = await createPerson(
    tx,
    actor,
    {
      name: row.profile.fullName,
      firstName: row.profile.firstName ?? null,
      lastName: row.profile.lastName ?? null,
      emails: [],
      phones: [],
      orgId,
      customFields: {},
    },
    signal,
  );
  if (!created.ok) throw created.error;
  return created.value.id;
}

export function assertBackedSelections(
  selections: readonly Selection[],
  row: ProspectRevealRow,
): void {
  const shape = validateSelections(selections);
  if (!shape.ok) throw shape.error;
  const unbacked = selections.filter((s) => !isBackedByRun(row.outcomes, s));
  if (unbacked.length > 0) {
    throw new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "selection is not backed by the reveal", {
      canonicalKeys: unbacked.map((s) => s.canonicalKey),
    });
  }
}

export async function writeChangeLogs(
  tx: Db,
  actor: ContactActor,
  personId: string,
  source: { row: ProspectRevealRow; selections: readonly Selection[] },
  applied: Outcome,
): Promise<void> {
  for (const field of applied.appliedFields) {
    const selection = source.selections.find((s) => s.canonicalKey === field);
    if (selection === undefined) continue;
    await tx.insert(changeLogs).values({
      entityType: "person",
      entityId: personId,
      field,
      oldValue: applied.appended.includes(field) ? null : (applied.previous[field] ?? null),
      newValue: {
        value: applied.written[field] ?? selection.value,
        providers: providersBehind(source.row.outcomes, selection),
      },
      actorId: actor.id,
    });
  }
}
