import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type * as schema from "@/db/schema";

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

export type DbOrTx = Db | Tx;

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

  const rows = (result as unknown as { rows: Array<{ version: number | string }> }).rows;
  const version = rows[0]?.version;

  if (version === undefined) {
    throw new AppError(
      ERROR_IDS.DB_INVARIANT,
      "bumpChannelVersion: RETURNING version returned no rows",
      { channel },
    );
  }

  return typeof version === "string" ? Number(version) : version;
}
