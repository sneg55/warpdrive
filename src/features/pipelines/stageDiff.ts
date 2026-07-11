// Pure diff for the Edit Pipeline page: turns the edited stage rows into the minimal set of
// create/update/delete operations to send to the server. Keeping this pure makes the save flow
// unit-testable without a DB or a rendered form.

export interface StageRow {
  // null id = a stage the user just added, not yet persisted.
  id: string | null;
  name: string;
  rottingDays: number | null;
}

export interface StageDiffInput {
  originalById: Record<string, { name: string; rottingDays: number | null }>;
  rows: StageRow[];
  deletedIds: string[];
}

export interface StageCreateOp {
  name: string;
  rottingDays: number | null;
}
export interface StageUpdateOp extends StageCreateOp {
  stageId: string;
}

export interface StageOps {
  creates: StageCreateOp[];
  updates: StageUpdateOp[];
  deletes: string[];
}

function changed(
  a: { name: string; rottingDays: number | null },
  b: { name: string; rottingDays: number | null },
): boolean {
  return a.name !== b.name || a.rottingDays !== b.rottingDays;
}

export function diffStages(input: StageDiffInput): StageOps {
  const creates: StageCreateOp[] = [];
  const updates: StageUpdateOp[] = [];

  for (const row of input.rows) {
    if (row.id === null) {
      creates.push({ name: row.name, rottingDays: row.rottingDays });
      continue;
    }
    const orig = input.originalById[row.id];
    if (orig === undefined) continue;
    if (changed(orig, row)) {
      updates.push({
        stageId: row.id,
        name: row.name,
        rottingDays: row.rottingDays,
      });
    }
  }

  // Dedupe deletes: a StrictMode double-invoked updater can record the same id twice, and deleting
  // a stage twice makes the second call fail with STAGE_NOT_FOUND (PIPELINES-07).
  return { creates, updates, deletes: [...new Set(input.deletedIds)] };
}
