import type { savedFilters } from "@/db/schema/savedFilters";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { listSavedFilters } from "./savedFilterActions";
import type { SavedFilterTargetEntity } from "./schemas";

type SavedFilterRow = typeof savedFilters.$inferSelect;

export type SavedFilterListItem<D> = Omit<SavedFilterRow, "definition"> & {
  isOwn: boolean;
  definition: D;
};

interface SavedFilterListCtx {
  db: DbOrTx;
  actor: { id: string; type: string; flags: Iterable<string> };
}

export async function listSavedFilterViews<D>(
  ctx: SavedFilterListCtx,
  targetEntity: SavedFilterTargetEntity,
  parse: (raw: unknown) => D,
): Promise<Array<SavedFilterListItem<D>>> {
  const flags: Record<string, boolean> = {};
  for (const f of ctx.actor.flags) flags[f] = true;
  const rows = await listSavedFilters(
    ctx.db,
    { userId: ctx.actor.id, isAdmin: ctx.actor.type === "admin", flags },
    targetEntity,
    AbortSignal.timeout(10_000),
  );
  return rows.map((r) => ({
    ...r,
    isOwn: r.ownerId === ctx.actor.id,
    definition: parse(r.definition),
  }));
}
