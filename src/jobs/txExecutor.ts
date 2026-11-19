import { type SQL, sql } from "drizzle-orm";
import type { SendOptions } from "pg-boss";
import type { DbOrTx } from "@/server/realtime/channelVersions";

const PLACEHOLDER = /\$(\d+)/;

function bindPlaceholders(text: string, values: unknown[]): SQL {
  const parts = text.split(PLACEHOLDER);
  const chunks: SQL[] = [];
  parts.forEach((part, i) => {
    chunks.push(i % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`);
  });
  return sql.join(chunks, sql``);
}

type BossDb = NonNullable<SendOptions["db"]>;

export function bossExecutorOn(db: DbOrTx): BossDb {
  return {
    executeSql: async (text, values = []) => {
      const result = await db.execute(bindPlaceholders(text, values));
      return { rows: result.rows };
    },
  };
}
