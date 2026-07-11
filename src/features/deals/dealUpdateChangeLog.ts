// Change-log writes for updateDeal, extracted to keep dealUpdate.ts under the size/complexity
// caps. Every row is written on the caller's transaction (atomic with the UPDATE) and only when
// the field was present in the input AND its value actually changed (a no-op edit logs nothing).
import {
  CHANGE_FIELD_EXPECTED_CLOSE,
  CHANGE_FIELD_ORG,
  CHANGE_FIELD_PERSON,
  CHANGE_FIELD_SOURCE_CHANNEL_ID,
  CHANGE_FIELD_TITLE,
  CHANGE_FIELD_VALUE,
  customFieldChangeField,
} from "@/constants/changeLogFields";
import type { deals } from "@/db/schema/deals";
import { recordChange } from "@/features/collaboration/changeLog";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { DealUpdateInput } from "./schemas";

type DealRow = typeof deals.$inferSelect;

// Order-insensitive equality for the label-key arrays, so reordering the same set is a no-op.
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// Scalar deal columns that log identically: present-in-input AND changed.
function scalarChanges(
  input: DealUpdateInput,
  before: DealRow,
  after: DealRow,
): { field: string; oldValue: unknown; newValue: unknown }[] {
  return [
    {
      present: input.title !== undefined,
      field: CHANGE_FIELD_TITLE,
      o: before.title,
      n: after.title,
    },
    {
      present: input.value !== undefined,
      field: CHANGE_FIELD_VALUE,
      o: before.value,
      n: after.value,
    },
    {
      present: input.expectedCloseDate !== undefined,
      field: CHANGE_FIELD_EXPECTED_CLOSE,
      o: before.expectedCloseDate,
      n: after.expectedCloseDate,
    },
    {
      present: input.sourceChannelId !== undefined,
      field: CHANGE_FIELD_SOURCE_CHANNEL_ID,
      o: before.sourceChannelId,
      n: after.sourceChannelId,
    },
    {
      present: input.personId !== undefined,
      field: CHANGE_FIELD_PERSON,
      o: before.personId,
      n: after.personId,
    },
    {
      present: input.orgId !== undefined,
      field: CHANGE_FIELD_ORG,
      o: before.orgId,
      n: after.orgId,
    },
  ]
    .filter((c) => c.present && c.o !== c.n)
    .map((c) => ({ field: c.field, oldValue: c.o, newValue: c.n }));
}

// One row per custom-field key whose value actually changed (deep-equal via JSON to catch
// object/array values). `status` is intentionally NOT logged here (won/lost flow owns it).
function customFieldChanges(
  input: DealUpdateInput,
  before: DealRow,
): { field: string; oldValue: unknown; newValue: unknown }[] {
  if (input.customFields === undefined) return [];
  const prev = before.customFields as Record<string, unknown>;
  const out: { field: string; oldValue: unknown; newValue: unknown }[] = [];
  for (const [key, next] of Object.entries(input.customFields)) {
    const old = prev[key];
    if (JSON.stringify(old ?? null) === JSON.stringify(next ?? null)) continue;
    out.push({ field: customFieldChangeField(key), oldValue: old ?? null, newValue: next });
  }
  return out;
}

export async function logDealUpdateChanges(
  tx: DbOrTx,
  args: { input: DealUpdateInput; before: DealRow; after: DealRow; actorId: string },
  signal: AbortSignal,
): Promise<void> {
  const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];

  // Labels: order-insensitive array compare (reorder of the same set is a no-op).
  if (args.input.labels !== undefined && !arraysEqual(args.before.labels, args.after.labels)) {
    changes.push({ field: "labels", oldValue: args.before.labels, newValue: args.after.labels });
  }
  if (
    args.input.sourceChannel !== undefined &&
    args.before.sourceChannel !== args.after.sourceChannel
  ) {
    changes.push({
      field: "source_channel",
      oldValue: args.before.sourceChannel,
      newValue: args.after.sourceChannel,
    });
  }
  changes.push(...scalarChanges(args.input, args.before, args.after));
  changes.push(...customFieldChanges(args.input, args.before));

  for (const change of changes) {
    await recordChange(
      tx,
      {
        entityType: "deal",
        entityId: args.after.id,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        actorId: args.actorId,
      },
      signal,
    );
  }
}
