import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type * as schema from "@/db/schema";

// Transaction alias matching notify.ts: the Drizzle tx from db.transaction().
type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

// Accept either the root db or a transaction so callers can always pass their
// current context without branching (callers in a tx pass tx; callers outside
// can pass db directly for standalone bumps).
export type DbOrTx = Db | Tx;

// Atomic monotonic bump, safe inside the caller's transaction so a rolled-back
// write never publishes a version. Returns the new version as a number (column
// mode is "number", NOT bigint, matching the Phase 1 schema).
export async function bumpChannelVersion(
  tx: DbOrTx,
  channel: string,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted();

  const result = await tx.execute(sql`
    INSERT INTO channel_versions (channel, version)
    VALUES (${channel}, 1)
    ON CONFLICT (channel)
    DO UPDATE SET
      version = channel_versions.version + 1,
      updated_at = now()
    RETURNING version
  `);

  signal.throwIfAborted();

  // drizzle-orm/node-postgres .execute() returns QueryResult<Record<string,unknown>>;
  // the rows array is at .rows.
  const rows = (result as unknown as { rows: Array<{ version: number | string }> }).rows;
  const version = rows[0]?.version;

  if (version === undefined) {
    throw new AppError(
      ERROR_IDS.DB_INVARIANT,
      "bumpChannelVersion: RETURNING version returned no rows",
      { channel },
    );
  }

  // Postgres returns bigint columns as strings over the wire; coerce to number.
  return typeof version === "string" ? Number(version) : version;
}
