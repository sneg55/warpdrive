import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { DedupMode } from "@/constants/importStatus";
import { IMPORTING_LEASE_MS } from "@/constants/importStatus";
import type { Db } from "@/db/client";
import { importRows, organizations, persons } from "@/db/schema";
import { can } from "@/features/permissions/can";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { type MappedRow, upgradeMappedRow } from "@/types/import";
import { err, ok, type Result } from "@/types/result";
import { type Commit, finalize, type ImportActor } from "./commitHelpers";
import { createWithRelations, updateWithRelations } from "./commitRelations";
import { findCandidates } from "./dedup";
import type { ImportTarget } from "./wizardState";

export type { ImportActor } from "./commitHelpers";

type ClaimedRow = { id: string; mapped: MappedRow };

// Retry-safe commit of a single validated import row. claim + dedup + create/
// update + finalize all run in ONE transaction: a failure rolls back the whole
// row commit, and the atomic claim makes a retry an idempotent no-op rather than
// a double-create.
export async function commitRow(
  db: Db,
  actor: ImportActor,
  rowId: string,
  target: ImportTarget,
  dedupMode: DedupMode,
  signal: AbortSignal,
): Promise<Result<Commit, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();

    // 1. Atomic claim: valid -> importing, or reclaim a stale importing past lease.
    const lease = new Date(Date.now() - IMPORTING_LEASE_MS);
    const claimed = await tx.execute(sql`
      UPDATE import_rows SET status = 'importing', claimed_at = now()
      WHERE id = ${rowId}
        AND (status = 'valid' OR (status = 'importing' AND claimed_at < ${lease}))
      RETURNING id, mapped
    `);

    if (claimed.rows.length === 0) {
      // Already imported/skipped/held by a live lease: read back the terminal
      // status (idempotent no-op, the heart of retry safety).
      const [existing] = await tx.select().from(importRows).where(sql`${importRows.id} = ${rowId}`);
      if (existing === undefined) {
        return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "row gone", { rowId }));
      }
      return ok({ status: existing.status, entityId: existing.createdEntityId });
    }

    const first = claimed.rows[0] as ClaimedRow | undefined;
    if (first === undefined) {
      return err(new AppError(ERROR_IDS.IMPORT_ROW_GONE, "claim returned no row", { rowId }));
    }
    // Upgrade in place: a row validated before cross-entity mapping holds a flat mapped object and
    // is already "valid", so nothing else would ever convert it.
    const mapped = upgradeMappedRow(first.mapped);

    // 2. Visibility-scoped dedup (Task 23). Only person/organization have a natural dedup key
    // (email / name), and it lives on the row's PRIMARY record; deal/lead/activity always create.
    if (target === "person" || target === "organization") {
      const cand = await findCandidates(tx, actor, target, mapped.primary, signal);

      if (cand.outcome === "ambiguous") {
        return finalize(tx, rowId, "invalid", null, [
          { field: "email", message: `ambiguous match: ${cand.count} existing contacts` },
        ]);
      }

      if (cand.outcome === "one") {
        if (dedupMode === "skip") {
          return finalize(tx, rowId, "skipped_duplicate", cand.candidateId, []);
        }
        return applyOneUpdate(tx, actor, target, cand.candidateId, mapped, rowId, signal);
      }
    }

    // 3. Zero candidates (or no dedup key for this target): create via the audited
    // authority (trust boundary). A malformed mapped row fails the boundary parse
    // and finalizes "invalid" (never an opaque DB throw that would roll back the
    // claim and loop forever).
    const created = await createWithRelations(tx, actor, target, mapped, signal);
    if (created.ok === false) {
      return finalize(tx, rowId, "invalid", null, created.error);
    }
    return finalize(tx, rowId, "imported", created.value.entityId, [], created.value.side);
  });
}

// Update path: gated by contact.edit on the candidate, then the audited update.
async function applyOneUpdate(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  actor: ImportActor,
  target: "person" | "organization",
  candidateId: string,
  mapped: MappedRow,
  rowId: string,
  signal: AbortSignal,
): Promise<Result<Commit, AppError>> {
  const [existing] =
    target === "person"
      ? await tx.select().from(persons).where(sql`${persons.id} = ${candidateId}`)
      : await tx.select().from(organizations).where(sql`${organizations.id} = ${candidateId}`);
  if (existing === undefined) {
    return finalize(tx, rowId, "invalid", null, [{ field: "_", message: "candidate vanished" }]);
  }

  const record: VisiblePersonOrOrg = {
    kind: target === "person" ? "person" : "organization",
    ownerId: existing.ownerId,
    visibilityLevel: existing.visibilityLevel,
    visibilityGroupId: existing.visibilityGroupId,
    visibleToUserIds: existing.visibleToUserIds,
  };
  if (can(actor, "contact.edit", record) === false) {
    return finalize(tx, rowId, "invalid", null, [
      { field: "_", message: "not permitted to update" },
    ]);
  }

  // The row still describes the record's organization and note even when it matched an existing
  // contact. Resolve them in the same savepoint the update runs in, or "update" mode silently
  // discards every related record the row carried.
  const updated = await updateWithRelations(tx, actor, target, candidateId, mapped, signal);
  if (updated.ok === false) {
    return finalize(tx, rowId, "invalid", null, updated.error);
  }
  // createdEntityId stays null: this row UPDATED a pre-existing record, it did not create
  // one. Undo deletes only rows with a non-null createdEntityId, so a pre-existing record
  // that an "update"-mode import merely edited is never soft-deleted by undo (data-loss guard).
  // Its side effects (an org/note this row DID create) still carry, so undo can clean those up.
  return finalize(tx, rowId, "imported", null, [], updated.value);
}
