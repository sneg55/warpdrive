import type { savedFilters } from "@/db/schema/savedFilters";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { listSavedFilters } from "./savedFilterActions";
import type { SavedFilterTargetEntity } from "./schemas";

type SavedFilterRow = typeof savedFilters.$inferSelect;

export type SavedFilterListItem<D> = Omit<SavedFilterRow, "definition"> & {
  // isOwn lets the client hide the favorite star on others' shared filters (only the owner can
  // toggle the owner-scoped favorite flag), so the star is never a dead control.
  isOwn: boolean;
  definition: D;
};

interface SavedFilterListCtx {
  db: DbOrTx;
  actor: { id: string; type: string; flags: Iterable<string> };
}

// One read behind every saved-view list (deal board, People, Orgs, Leads). The parser is a
// parameter so the deal route keeps its deal-typed definition while the entity-aware route parses
// each row against its own field allow-list.
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
